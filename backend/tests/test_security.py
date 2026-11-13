import os, time
from datetime import timedelta
from sqlalchemy import select
from app.config import get_settings
from app.db import SessionLocal, utcnow
from app.models import AuditLog, File, Share, SecurityEvent, User
from app.services.encryption import DecryptionError, EncryptionService, KeyManager
from app.services.storage import LocalStorage, StorageError
from app.services.audit import verify_chain
from .conftest import PDF, make_user, upload

ADMIN_URLS = ["/api/admin/security/overview", "/api/admin/security/logins", "/api/admin/security/events",
              "/api/admin/security/audit", "/api/admin/security/audit/export.csv", "/api/admin/users",
              "/api/admin/keys", "/api/admin/system", "/api/admin/files", "/api/admin/sharing"]


# ---------- authorization boundary ----------
def test_unauthenticated_admin_rejected(client):
    for u in ADMIN_URLS:
        assert client.get(u).status_code == 401, u


def test_standard_user_admin_rejected_and_logged(client, alice):
    for u in ADMIN_URLS:
        assert client.get(u, headers=alice).status_code == 403, u
    assert client.post("/api/admin/keys/rotate", headers=alice, json={}).status_code == 403
    with SessionLocal() as db:
        assert db.scalar(select(SecurityEvent).where(SecurityEvent.description.like("Non-administrator%")))


def test_guest_share_token_cannot_reach_admin(client):
    assert client.get("/api/admin/security/overview", headers={"Authorization": "Bearer not-a-jwt"}).status_code == 401


def test_admin_allowed(client, admin):
    for u in ADMIN_URLS:
        assert client.get(u, headers=admin).status_code == 200, u


def test_role_escalation_rejected(client, alice):
    r = client.post("/api/auth/register", json={"email": "evil@example.com", "password": "Passw0rd!x", "full_name": "E", "role": "admin"})
    assert r.status_code == 422
    assert client.patch("/api/users/me", headers=alice, json={"role": "admin"}).status_code == 422
    assert client.get("/api/auth/me", headers=alice).json()["role"] == "user"
    uid = client.get("/api/auth/me", headers=alice).json()["id"]
    assert client.patch(f"/api/admin/users/{uid}", headers=alice, json={"role": "admin"}).status_code == 403
    assert client.get("/api/admin/users", headers=alice).status_code == 403


def test_invalid_and_expired_jwt(client):
    import jwt
    s = get_settings()
    bad = jwt.encode({"sub": "x", "jti": "j", "exp": utcnow() - timedelta(minutes=1)}, s.jwt_secret, algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {bad}"}).status_code == 401
    forged = jwt.encode({"sub": "x", "jti": "j", "exp": utcnow() + timedelta(minutes=5)}, "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256")
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {forged}"}).status_code == 401


def test_logout_revokes_token(client, alice):
    assert client.post("/api/auth/logout", headers=alice).status_code == 200
    assert client.get("/api/auth/me", headers=alice).status_code == 401


def test_login_generic_error_and_events(client, alice):
    a = client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrongpass1"})
    b = client.post("/api/auth/login", json={"email": "nobody@example.com", "password": "wrongpass1"})
    assert a.status_code == b.status_code == 401 and a.json() == b.json()


def test_failed_login_burst_creates_event(client, alice):
    for _ in range(5):
        client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope-nope1"})
    with SessionLocal() as db:
        assert db.scalar(select(SecurityEvent).where(SecurityEvent.category == "multiple_failed_logins"))


def test_rate_limit_blocks(client):
    get_settings().rate_limit_enabled = True
    try:
        codes = [client.post("/api/auth/login", json={"email": "a@example.com", "password": "x" * 9}).status_code for _ in range(12)]
        assert 429 in codes
    finally:
        get_settings().rate_limit_enabled = False


# ---------- files ----------
def test_upload_download_roundtrip_and_encrypted_at_rest(client, alice):
    r = upload(client, alice); assert r.status_code == 201, r.text
    fid = r.json()["id"]
    assert client.get(f"/api/files/{fid}/download", headers=alice).content == PDF
    with SessionLocal() as db:
        f = db.get(File, fid)
        raw = open(os.path.join(get_settings().local_storage_dir, f.storage_key), "rb").read()
    assert b"hello secret contents" not in raw and not raw.startswith(b"%PDF")
    assert len(raw) == len(PDF) + 16               # ciphertext + GCM tag
    body = client.get(f"/api/files/{fid}", headers=alice).text
    assert "wrapped" not in body and "nonce" not in body and "storage_key" not in body


def test_cross_user_download_rejected(client, alice, bob):
    fid = upload(client, alice).json()["id"]
    for path in ("download", "preview"):
        assert client.get(f"/api/files/{fid}/{path}", headers=bob).status_code == 403
    assert client.delete(f"/api/files/{fid}", headers=bob).status_code == 403
    assert client.patch(f"/api/files/{fid}", headers=bob, json={"name": "x.pdf"}).status_code == 403
    assert client.post("/api/shares", headers=bob, json={"file_id": fid, "kind": "link", "permission": "download", "expires_in_hours": 1}).status_code == 403
    assert client.get(f"/api/files/{fid}/download").status_code == 401
    assert fid not in [f["id"] for f in client.get("/api/files", headers=bob).json()["items"]]


def test_upload_validation(client, alice):
    assert upload(client, alice, "evil.exe", b"MZ....").status_code == 415
    assert upload(client, alice, "fake.pdf", b"not a pdf").status_code == 415
    assert upload(client, alice, "big.txt", b"a" * (1024 * 1024 + 10)).status_code == 413
    assert upload(client, alice, "empty.txt", b"").status_code == 422
    assert upload(client, alice, "noext", b"abc").status_code == 422
    assert upload(client, alice, "../../etc/passwd.txt", b"hello").json()["name"] == "passwd.txt"


def test_duplicate_names_and_trash_flow(client, alice):
    a = upload(client, alice, "a.txt", b"one").json(); b = upload(client, alice, "a.txt", b"two").json()
    assert b["name"] == "a (1).txt"
    assert client.delete(f"/api/files/{a['id']}?permanent=true", headers=alice).status_code == 409
    assert client.delete(f"/api/files/{a['id']}", headers=alice).status_code == 200
    assert client.get(f"/api/files/{a['id']}/download", headers=alice).status_code == 404
    assert [f["id"] for f in client.get("/api/files?view=trash", headers=alice).json()["items"]] == [a["id"]]
    assert client.post(f"/api/files/{a['id']}/restore", headers=alice).status_code == 200
    client.delete(f"/api/files/{a['id']}", headers=alice)
    assert client.delete(f"/api/files/{a['id']}?permanent=true", headers=alice).status_code == 200


def test_folders_favorites_search(client, alice):
    fo = client.post("/api/folders", headers=alice, json={"name": "Docs"}).json()
    f = client.post("/api/files/upload", headers=alice, data={"folder_id": fo["id"]}, files={"file": ("n.txt", b"hi")}).json()
    assert f["folder_id"] == fo["id"]
    assert client.get("/api/files", headers=alice).json()["total"] == 0
    assert client.get(f"/api/files?folder_id={fo['id']}", headers=alice).json()["total"] == 1
    assert client.get("/api/files?q=n.t", headers=alice).json()["total"] == 1
    client.put(f"/api/files/{f['id']}/favorite", headers=alice)
    assert client.get("/api/files?view=favorites", headers=alice).json()["total"] == 1
    assert client.delete(f"/api/folders/{fo['id']}", headers=alice).status_code == 409


def test_quota_enforced(client, alice):
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == "alice@example.com")); u.quota_bytes = 100; db.commit()
    assert upload(client, alice, "q.txt", b"x" * 200).status_code == 413


# ---------- encryption unit tests ----------
def _svc():
    return EncryptionService(KeyManager(get_settings()))


def test_encrypt_roundtrip_unique_keys_and_nonces():
    s = _svc(); a = s.encrypt(b"data", "f1"); b = s.encrypt(b"data", "f1")
    assert a.ciphertext != b.ciphertext and a.nonce_b64 != b.nonce_b64 and a.wrapped_dek != b.wrapped_dek
    kw = dict(file_id="f1", nonce_b64=a.nonce_b64, wrapped_dek=a.wrapped_dek, kek_version=a.kek_version)
    assert s.decrypt(a.ciphertext, **kw) == b"data"


def test_tampered_ciphertext_rejected():
    import pytest
    s = _svc(); a = s.encrypt(b"important", "f1")
    bad = bytearray(a.ciphertext); bad[0] ^= 1
    with pytest.raises(DecryptionError):
        s.decrypt(bytes(bad), file_id="f1", nonce_b64=a.nonce_b64, wrapped_dek=a.wrapped_dek, kek_version=a.kek_version)
    with pytest.raises(DecryptionError):   # ciphertext swapped onto a different record
        s.decrypt(a.ciphertext, file_id="f2", nonce_b64=a.nonce_b64, wrapped_dek=a.wrapped_dek, kek_version=a.kek_version)
    with pytest.raises(DecryptionError):   # truncated
        s.decrypt(a.ciphertext[:-1], file_id="f1", nonce_b64=a.nonce_b64, wrapped_dek=a.wrapped_dek, kek_version=a.kek_version)


def test_tampered_stored_object_is_rejected_via_api(client, alice):
    fid = upload(client, alice).json()["id"]
    with SessionLocal() as db:
        p = os.path.join(get_settings().local_storage_dir, db.get(File, fid).storage_key)
    b = bytearray(open(p, "rb").read()); b[5] ^= 0xFF; open(p, "wb").write(bytes(b))
    r = client.get(f"/api/files/{fid}/download", headers=alice)
    assert r.status_code == 500 and PDF[:10] not in r.content
    with SessionLocal() as db:
        assert db.scalar(select(SecurityEvent).where(SecurityEvent.category == "integrity_failure", SecurityEvent.severity == "critical"))


def test_key_rotation_keeps_files_decryptable(client, alice, admin):
    fid = upload(client, alice).json()["id"]
    r = client.post("/api/admin/keys/rotate", headers=admin, json={}); assert r.status_code == 200, r.text
    assert r.json()["to"] == r.json()["from"] + 1 and r.json()["files_rewrapped"] == 1
    assert client.get(f"/api/files/{fid}/download", headers=alice).content == PDF
    new = upload(client, alice, "n.txt", b"after rotation").json()["id"]
    assert client.get(f"/api/files/{new}/download", headers=alice).content == b"after rotation"
    keys = client.get("/api/admin/keys", headers=admin).json()
    assert keys["files_by_version"] == {str(keys["active_version"]): 2}
    assert "wrapped_dek" not in str(keys) and "key_material" not in str(keys) and "nonce" not in str(keys)


def test_local_storage_blocks_traversal(tmp_path):
    import pytest
    st = LocalStorage(str(tmp_path))
    for k in ("../../etc/passwd", "/etc/passwd", "ab/../../x", "zz/" + "g" * 46):
        with pytest.raises(StorageError):
            st.get(k)


# ---------- sharing ----------
def _link(client, h, fid, perm="download", hours=24, **kw):
    r = client.post("/api/shares", headers=h, json={"file_id": fid, "kind": "link", "permission": perm, "expires_in_hours": hours, **kw})
    assert r.status_code == 201, r.text
    return r.json(), r.json()["url"].rsplit("/", 1)[1]


def test_share_link_flow_and_revocation(client, alice):
    fid = upload(client, alice).json()["id"]
    sh, tok = _link(client, alice, fid)
    with SessionLocal() as db:
        s = db.get(Share, sh["id"])
        assert s.token_hash and tok not in s.token_hash and len(s.token_hash) == 64
    assert client.get(f"/api/public/shares/{tok}").json()["permission"] == "download"
    assert client.get(f"/api/public/shares/{tok}/download").content == PDF
    assert client.post(f"/api/shares/{sh['id']}/revoke", headers=alice).json()["status"] == "revoked"
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 410
    mine = client.get("/api/shares/mine", headers=alice).json()["items"][0]
    assert mine["status"] == "revoked" and mine["use_count"] == 1 and "token" not in str(mine).lower().replace("token_", "")


def test_expired_link_rejected(client, alice):
    fid = upload(client, alice).json()["id"]
    sh, tok = _link(client, alice, fid)
    with SessionLocal() as db:
        s = db.get(Share, sh["id"]); s.expires_at = utcnow() - timedelta(seconds=1); db.commit()
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 410
    assert client.get(f"/api/public/shares/{tok}").status_code == 410


def test_view_only_link_cannot_download(client, alice):
    fid = upload(client, alice).json()["id"]
    _, tok = _link(client, alice, fid, "view")
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 403
    r = client.get(f"/api/public/shares/{tok}/view"); assert r.status_code == 200 and r.content == PDF
    assert "inline" in r.headers["content-disposition"]


def test_invalid_token_and_deleted_file(client, alice):
    assert client.get("/api/public/shares/does-not-exist/download").status_code == 404
    fid = upload(client, alice).json()["id"]; _, tok = _link(client, alice, fid)
    client.delete(f"/api/files/{fid}", headers=alice)
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 410


def test_download_limit(client, alice):
    fid = upload(client, alice).json()["id"]; _, tok = _link(client, alice, fid, max_downloads=1)
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 200
    assert client.get(f"/api/public/shares/{tok}/download").status_code == 410


def test_direct_share_permissions(client, alice, bob):
    carol = make_user(client, "carol@example.com")
    fid = upload(client, alice).json()["id"]
    r = client.post("/api/shares", headers=alice, json={"file_id": fid, "kind": "user", "recipient_email": "bob@example.com", "permission": "view", "expires_in_hours": 2})
    sid = r.json()["id"]
    assert client.get(f"/api/shares/{sid}/view", headers=bob).status_code == 200
    assert client.get(f"/api/shares/{sid}/download", headers=bob).status_code == 403     # beyond share permission
    assert client.get(f"/api/shares/{sid}/view", headers=carol).status_code == 403        # not the recipient
    assert client.post(f"/api/shares/{sid}/revoke", headers=bob).status_code == 403
    assert len(client.get("/api/shares/with-me", headers=bob).json()["items"]) == 1
    client.post(f"/api/shares/{sid}/revoke", headers=alice)
    assert client.get(f"/api/shares/{sid}/view", headers=bob).status_code == 403
    assert client.get(f"/api/files/{fid}/download", headers=bob).status_code == 403       # share never grants owner routes


def test_share_expiry_limit(client, alice):
    fid = upload(client, alice).json()["id"]
    r = client.post("/api/shares", headers=alice, json={"file_id": fid, "kind": "link", "permission": "view", "expires_in_hours": 24 * 365})
    assert r.status_code == 422


# ---------- audit / admin dashboard data ----------
def test_audit_and_security_data_recorded_and_hidden(client, alice, bob, admin):
    fid = upload(client, alice).json()["id"]; _, tok = _link(client, alice, fid)
    client.get(f"/api/files/{fid}/download", headers=bob)                  # denied
    client.get("/api/public/shares/bad/download")                           # invalid link
    ov = client.get("/api/admin/security/overview", headers=admin).json()
    assert ov["cards"]["total_logins"]["value"] >= 3 and ov["cards"]["unauthorized_attempts"]["value"] >= 1
    assert sum(d["blocked"] for d in ov["access_series"]) >= 1
    ev = client.get("/api/admin/security/events?severity=medium", headers=admin).json()
    assert any(e["category"] == "unauthorized_access" for e in ev["items"])
    au = client.get("/api/admin/security/audit?action=file.", headers=admin).json()
    assert {"file.upload", "file.access_denied"} <= {a["action"] for a in au["items"]}
    csvtxt = client.get("/api/admin/security/audit/export.csv", headers=admin).text
    assert "file.upload" in csvtxt and tok not in csvtxt and "Passw0rd" not in csvtxt
    lg = client.get("/api/admin/security/logins?status=success", headers=admin).json()
    assert lg["total"] >= 3 and lg["items"][0]["location"] is None
    assert client.get("/api/admin/security/audit/verify", headers=admin).json()["ok"] is True
    act = client.get("/api/activity", headers=bob).json()
    assert all(a["by_me"] or a["resource_id"] != fid for a in act["items"])   # only his own denied attempt, no alice entries
    with SessionLocal() as db:
        txt = " ".join(str(r.details) for r in db.scalars(select(AuditLog))) + " ".join(str(e.details) for e in db.scalars(select(SecurityEvent)))
        assert tok not in txt and "Passw0rd" not in txt


def test_audit_chain_detects_tampering(client, alice):
    upload(client, alice); upload(client, alice, "b.txt", b"b")
    with SessionLocal() as db:
        rows = db.scalars(select(AuditLog).order_by(AuditLog.id)).all()
        rows[1].details = {"edited": True}; db.commit()
        assert verify_chain(db)["ok"] is False


def test_analytics_scoped_to_user(client, alice, bob):
    fid = upload(client, alice).json()["id"]
    client.get(f"/api/files/{fid}/download", headers=alice)
    a = client.get("/api/analytics/overview", headers=alice).json()
    b = client.get("/api/analytics/overview", headers=bob).json()
    assert a["summary"]["uploads"]["value"] == 1 and a["summary"]["downloads"]["value"] == 1 and a["summary"]["storage_used"] == len(PDF)
    assert b["summary"]["uploads"]["value"] == 0 and b["recent_uploads"] == [] and b["recent_downloads"] == []
    assert client.get("/api/analytics/overview?start=2026-02-01&end=2026-01-01", headers=alice).status_code == 422
    assert client.get("/api/analytics/overview").status_code == 401


def test_activity_isolation_and_security_status_no_secrets(client, alice, bob):
    upload(client, alice)
    assert all(a["resource_type"] != "file" for a in client.get("/api/activity", headers=bob).json()["items"])
    st = client.get("/api/security/status", headers=alice)
    assert st.status_code == 200 and st.json()["encryption"]["algorithm"] == "AES-256-GCM"
    assert "dev_master" not in st.text and "secret" not in st.text.lower().replace("secrets", "")


def test_password_reset_single_use(client, alice):
    t = client.post("/api/auth/forgot-password", json={"email": "alice@example.com"}).json()["dev_reset_token"]
    assert client.post("/api/auth/reset-password", json={"token": t, "password": "NewPassw0rd!"}).status_code == 200
    assert client.post("/api/auth/reset-password", json={"token": t, "password": "Another1pass"}).status_code == 400
    assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "NewPassw0rd!"}).status_code == 200
    unk = client.post("/api/auth/forgot-password", json={"email": "ghost@example.com"}).json()
    assert "dev_reset_token" not in unk


def test_oauth_unconfigured_is_honest(client):
    assert client.get("/api/auth/oauth/providers").json() == {"google": {"configured": False}, "microsoft": {"configured": False}}
    assert client.get("/api/auth/oauth/google/login", follow_redirects=False).status_code == 501


def test_malformed_input(client, alice):
    assert client.post("/api/auth/register", json={"email": "bad", "password": "x", "full_name": ""}).status_code == 422
    assert client.post("/api/shares", headers=alice, json={"file_id": "x"}).status_code == 422
    assert client.get("/api/files?page=0", headers=alice).status_code == 422
    assert client.get("/api/files/" + "a" * 5000, headers=alice).status_code == 404


# ---------- passcode-protected shares ----------
def test_passcode_protected_link_flow(client, alice):
    fid = upload(client, alice).json()["id"]
    sh, tok = _link(client, alice, fid, passcode="open-sesame-1")
    info = client.get(f"/api/public/shares/{tok}").json()
    assert info["passcode_protected"] is True
    # no passcode grant -> blocked
    r = client.get(f"/api/public/shares/{tok}/download")
    assert r.status_code == 401 and r.headers.get("x-share-passcode") == "required"
    # wrong passcode -> rejected and alert raised
    assert client.post(f"/api/public/shares/{tok}/verify", json={"passcode": "wrong-pass"}).status_code == 401
    # correct passcode -> short-lived grant
    v = client.post(f"/api/public/shares/{tok}/verify", json={"passcode": "open-sesame-1"})
    assert v.status_code == 200 and v.json()["passcode_required"] is True
    grant = v.json()["passcode_token"]
    r = client.get(f"/api/public/shares/{tok}/download", headers={"X-Share-Passcode-Token": grant})
    assert r.status_code == 200 and r.content == PDF
    # a random token cannot bypass the gate
    assert client.get(f"/api/public/shares/{tok}/download", headers={"X-Share-Passcode-Token": "nope"}).status_code == 401
    # the raw passcode is never stored or exposed
    with SessionLocal() as db:
        s = db.get(Share, sh["id"])
        assert s.passcode_hash and "open-sesame-1" not in s.passcode_hash
    mine = client.get("/api/shares/mine", headers=alice).json()["items"][0]
    assert mine["passcode_protected"] is True and "open-sesame-1" not in str(mine)


def test_passcode_protected_direct_share(client, alice, bob):
    fid = upload(client, alice).json()["id"]
    r = client.post("/api/shares", headers=alice, json={"file_id": fid, "kind": "user", "recipient_email": "bob@example.com",
                                                       "permission": "download", "expires_in_hours": 2, "passcode": "bob-secret-9"})
    sid = r.json()["id"]
    assert client.get(f"/api/shares/{sid}/download", headers=bob).status_code == 401
    assert client.post(f"/api/shares/{sid}/verify", headers=bob, json={"passcode": "bad"}).status_code == 401
    grant = client.post(f"/api/shares/{sid}/verify", headers=bob, json={"passcode": "bob-secret-9"}).json()["passcode_token"]
    assert client.get(f"/api/shares/{sid}/download", headers={**bob, "X-Share-Passcode-Token": grant}).content == PDF


def test_passcode_link_revoked_and_expired(client, alice):
    fid = upload(client, alice).json()["id"]
    sh, tok = _link(client, alice, fid, passcode="pass-1234")
    grant = client.post(f"/api/public/shares/{tok}/verify", json={"passcode": "pass-1234"}).json()["passcode_token"]
    client.post(f"/api/shares/{sh['id']}/revoke", headers=alice)
    # even with a valid passcode grant, a revoked link is dead
    assert client.get(f"/api/public/shares/{tok}/download", headers={"X-Share-Passcode-Token": grant}).status_code == 410
    sh2, tok2 = _link(client, alice, fid, passcode="pass-1234")
    with SessionLocal() as db:
        s = db.get(Share, sh2["id"]); s.expires_at = utcnow() - timedelta(seconds=1); db.commit()
    assert client.get(f"/api/public/shares/{tok2}/download").status_code == 410


# ---------- secure folder ----------
def test_secure_folder_lifecycle(client, alice):
    assert client.get("/api/secure-folder/status", headers=alice).json()["enabled"] is False
    assert client.post("/api/secure-folder/setup", headers=alice, json={"password": "vault-pass-1"}).status_code == 201
    assert client.get("/api/secure-folder/status", headers=alice).json()["enabled"] is True
    # locked by default
    assert client.get("/api/secure-folder/files", headers=alice).status_code == 423
    assert client.post("/api/secure-folder/unlock", headers=alice, json={"password": "nope-nope-1"}).status_code == 401
    tok = client.post("/api/secure-folder/unlock", headers=alice, json={"password": "vault-pass-1"}).json()["secure_token"]
    sh = {"Authorization": alice["Authorization"], "X-Secure-Token": tok}
    # upload straight into the vault
    r = client.post("/api/secure-folder/upload", headers=sh, files={"file": ("vault.pdf", PDF)})
    assert r.status_code == 201 and r.json()["secure"] is True
    vid = r.json()["id"]
    # hidden from normal listing and normal download routes
    assert all(i["id"] != vid for i in client.get("/api/files", headers=alice).json()["items"])
    assert client.get(f"/api/files/{vid}/download", headers=alice).status_code == 404
    # visible while unlocked, downloadable while unlocked
    assert [i["id"] for i in client.get("/api/secure-folder/files", headers=sh).json()["items"]] == [vid]
    assert client.get(f"/api/secure-folder/files/{vid}/download", headers=sh).content == PDF
    # move an ordinary file in, then out again
    fid = upload(client, alice).json()["id"]
    assert client.post(f"/api/secure-folder/files/{fid}/add", headers=sh).json()["secure"] is True
    assert client.get(f"/api/files/{fid}/download", headers=alice).status_code == 404
    assert client.post(f"/api/secure-folder/files/{fid}/remove", headers=sh).json()["secure"] is False
    assert client.get(f"/api/files/{fid}/download", headers=alice).status_code == 200
    # cannot share a secure file
    assert client.post("/api/shares", headers=alice, json={"file_id": vid, "kind": "link", "permission": "view",
                                                           "expires_in_hours": 1}).status_code == 404


def test_secure_folder_requires_setup(client, alice):
    assert client.get("/api/secure-folder/files", headers=alice).status_code == 409
    assert client.post("/api/secure-folder/unlock", headers=alice, json={"password": "whatever-1"}).status_code == 409


def test_secure_folder_change_password(client, alice):
    client.post("/api/secure-folder/setup", headers=alice, json={"password": "vault-pass-1"})
    assert client.post("/api/secure-folder/change-password", headers=alice,
                       json={"current_password": "bad", "new_password": "vault-pass-2"}).status_code == 400
    assert client.post("/api/secure-folder/change-password", headers=alice,
                       json={"current_password": "vault-pass-1", "new_password": "vault-pass-2"}).status_code == 200
    assert client.post("/api/secure-folder/unlock", headers=alice, json={"password": "vault-pass-1"}).status_code == 401
    assert client.post("/api/secure-folder/unlock", headers=alice, json={"password": "vault-pass-2"}).status_code == 200


# ---------- admin security dashboard ----------
def test_wrong_password_creates_security_alert(client, alice, admin):
    from app.models import SecurityAlert
    client.post("/api/auth/login", json={"email": "alice@example.com", "password": "definitely-wrong-1"})
    with SessionLocal() as db:
        a = db.scalar(select(SecurityAlert).where(SecurityAlert.kind == "failed_login"))
        assert a and a.severity == "high" and a.status == "open" and a.user_id
    alerts = client.get("/api/admin/security/alerts?status=open", headers=admin).json()
    assert alerts["total"] >= 1 and alerts["counts"]["open"] >= 1
    aid = alerts["items"][0]["id"]
    assert client.post(f"/api/admin/security/alerts/{aid}/acknowledge", headers=admin).json()["status"] == "acknowledged"
    assert client.get("/api/admin/security/alerts?status=open", headers=admin).json()["counts"]["open"] >= 0
    # standard users cannot read the security dashboard
    assert client.get("/api/admin/security/alerts", headers=alice).status_code == 403


def test_security_dashboard_per_user_posture(client, alice, bob, admin):
    client.post("/api/auth/login", json={"email": "bob@example.com", "password": "wrong-pass-1"})
    client.post("/api/auth/login", json={"email": "bob@example.com", "password": "wrong-pass-2"})
    r = client.get("/api/admin/security/users", headers=admin)
    assert r.status_code == 200
    items = {i["email"]: i for i in r.json()["items"]}
    assert items["bob@example.com"]["failed_logins_30d"] >= 2
    assert items["bob@example.com"]["risk_score"] > 0
    uid = items["bob@example.com"]["id"]
    detail = client.get(f"/api/admin/security/users/{uid}", headers=admin).json()
    assert detail["failed_logins_30d"] >= 2 and detail["alerts"]


def test_admin_dashboard_platform_metrics(client, alice, admin):
    fid = upload(client, alice).json()["id"]
    _link(client, alice, fid)
    r = client.get("/api/admin/analytics", headers=admin).json()
    assert r["users"] >= 1 and r["active_users"] >= 1
    assert r["files"] >= 1 and r["storage_bytes"] > 0
    assert r["storage_utilization_pct"] is not None
    assert r["shares"]["all"] >= 1 and r["shares"]["active"] >= 1
    assert "failed_logins" in r and "unauthorized_attempts" in r
    ov = client.get("/api/admin/security/overview", headers=admin).json()
    assert "open_alerts" in ov and "alerts_series" in ov and "alerts_by_severity" in ov


# =====================================================================================
# Admin Visit (password-gated admin panel) + encryption registry + live alert feed
# =====================================================================================
def test_admin_visit_requires_password_and_elevates_any_user(client, alice, bob):
    # A standard user cannot reach the admin API without the grant.
    r = client.get("/api/admin/analytics", headers=alice)
    assert r.status_code == 403
    assert r.headers.get("x-admin-visit") == "required"

    # Wrong password is rejected and raises a critical Security Dashboard alert.
    r = client.post("/api/admin-visit/unlock", headers=alice, json={"password": "nope"})
    assert r.status_code == 401
    r = client.get("/api/admin/security/alerts", headers=alice)  # still blocked
    assert r.status_code == 403

    # Correct password issues a scoped grant bound to this user.
    r = client.post("/api/admin-visit/unlock", headers=alice, json={"password": "123meadmin"})
    assert r.status_code == 200, r.text
    tok = r.json()["admin_token"]
    h = {**alice, "X-Admin-Visit": tok}

    st = client.get("/api/admin-visit/status", headers=h).json()
    assert st["unlocked"] is True and st["is_admin_role"] is False

    assert client.get("/api/admin/analytics", headers=h).status_code == 200
    assert client.get("/api/admin/users", headers=h).status_code == 200

    # The grant is bound to one account: another user cannot reuse it.
    assert client.get("/api/admin/analytics", headers={**bob, "X-Admin-Visit": tok}).status_code == 403

    # The grant is not an access token.
    assert client.get("/api/auth/me", headers={"Authorization": f"Bearer {tok}"}).status_code == 401


def test_admin_visit_failure_creates_critical_alert(client, alice, admin):
    client.post("/api/admin-visit/unlock", headers=alice, json={"password": "wrong-one"})
    r = client.get("/api/admin/security/alerts", headers=admin, params={"kind": "admin_visit_failure"})
    assert r.status_code == 200
    items = r.json()["items"]
    assert items and items[0]["severity"] == "critical"
    assert items[0]["email"] == "alice@example.com"


def test_encryption_registry_shows_per_file_keys(client, alice, admin):
    f = upload(client, alice).json()
    r = client.get("/api/admin/security/encryption", headers=admin)
    assert r.status_code == 200, r.text
    body = r.json()
    s = body["summary"]
    assert s["algorithm"] == "AES-256-GCM" and s["key_bits"] == 256 and s["nonce_bits"] == 96
    assert s["files"] == 1 and s["unique_data_keys"] == 1
    row = body["items"][0]
    assert row["id"] == f["id"]
    assert row["key_fingerprint"].startswith("dek_")
    assert row["status"] == "ok"
    assert row["nonce_b64"] and row["wrapped_dek_bytes"] > 0
    assert row["kek_version"] == s["active_kek_version"]
    # No raw key material is exposed.
    assert "wrapped_dek" not in row and "dek" not in row

    v = client.post(f"/api/admin/security/encryption/{f['id']}/verify", headers=admin)
    assert v.status_code == 200 and v.json()["ok"] is True and v.json()["bytes"] == f["size"]


def test_encryption_registry_distinct_keys_per_file(client, alice, admin):
    a = upload(client, alice, "a.pdf").json()
    b = upload(client, alice, "b.pdf").json()
    body = client.get("/api/admin/security/encryption", headers=admin).json()
    keys = {i["id"]: i["key_fingerprint"] for i in body["items"]}
    assert keys[a["id"]] != keys[b["id"]]          # every document has its own key
    assert body["summary"]["unique_data_keys"] == 2


def test_live_feed_reports_new_alerts(client, alice, admin):
    before = client.get("/api/admin/security/live", headers=admin).json()
    client.post("/api/admin-visit/unlock", headers=alice, json={"password": "bad"})
    after = client.get("/api/admin/security/live", headers=admin).json()
    assert after["latest_id"] > before["latest_id"]
    assert after["open"]["critical"] >= 1
    assert any(a["kind"] == "admin_visit_failure" for a in after["recent"])


def test_shared_file_appears_in_recipient_and_downloads(client, alice, bob):
    f = upload(client, alice).json()
    r = client.post("/api/shares", headers=alice, json={"file_id": f["id"], "kind": "user", "permission": "download",
                                                        "expires_in_hours": 24, "recipient_email": "bob@example.com"})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    with_me = client.get("/api/shares/with-me", headers=bob).json()["items"]
    assert any(x["id"] == sid and x["file"]["name"] == f["name"] for x in with_me)
    d = client.get(f"/api/shares/{sid}/download", headers=bob)
    assert d.status_code == 200 and d.content.startswith(b"%PDF")
