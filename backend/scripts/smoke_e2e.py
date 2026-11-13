"""End-to-end smoke test against a running TrustShare API.

Usage:
    python scripts/smoke_e2e.py http://localhost:8000

Exercises the full user journey the product promises:
  register -> login -> upload -> share with passcode -> recipient sees it ->
  passcode unlock -> safe download -> Admin Visit (wrong + right password) ->
  encryption key registry -> live alert feed.
"""
import sys
import uuid

import httpx

BASE = (sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8000").rstrip("/")
API = f"{BASE}/api"
ok = 0


def check(name, cond, extra=""):
    global ok
    if cond:
        ok += 1
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} {extra}")
        raise SystemExit(1)


def main():
    c = httpx.Client(timeout=30)
    tag = uuid.uuid4().hex[:8]
    owner = {"email": f"owner{tag}@example.com", "password": "OwnerPass123!", "full_name": "Owner"}
    guest = {"email": f"guest{tag}@example.com", "password": "GuestPass123!", "full_name": "Guest"}

    print("1. Registration")
    for u in (owner, guest):
        r = c.post(f"{API}/auth/register", json=u)
        check(f"register {u['email']}", r.status_code in (200, 201), r.text)

    print("2. Login")
    r = c.post(f"{API}/auth/login", json={"email": owner["email"], "password": owner["password"]})
    check("owner login", r.status_code == 200, r.text)
    otok = r.json()["access_token"]
    oh = {"Authorization": f"Bearer {otok}"}

    r = c.post(f"{API}/auth/login", json={"email": guest["email"], "password": guest["password"]})
    check("guest login", r.status_code == 200, r.text)
    gtok = r.json()["access_token"]
    gh = {"Authorization": f"Bearer {gtok}"}

    print("3. Upload + encrypt")
    payload = b"%PDF-1.4\n% smoke test document\n"
    r = c.post(f"{API}/files/upload", headers=oh,
               files={"file": ("contract.pdf", payload, "application/pdf")})
    check("upload", r.status_code in (200, 201), r.text)
    fid = r.json()["id"]

    r = c.get(f"{API}/files/{fid}", headers=oh)
    body = r.json()
    check("file has encryption metadata", body.get("enc_alg") == "AES-256-GCM", str(body)[:300])

    print("4. Share with passcode")
    r = c.post(f"{API}/shares", headers=oh, json={
        "file_id": fid, "kind": "user", "permission": "download", "recipient_email": guest["email"],
        "passcode": "open-sesame", "expires_in_hours": 24,
    })
    check("create share", r.status_code in (200, 201), r.text)
    share_id = r.json()["id"]

    print("5. Recipient sees the file in their dashboard")
    r = c.get(f"{API}/shares/with-me", headers=gh)
    items = r.json().get("items", []) if isinstance(r.json(), dict) else r.json()
    check("with-me lists share", r.status_code == 200 and any(s["id"] == share_id for s in items), r.text[:300])
    item = next(s for s in items if s["id"] == share_id)
    check("share flagged passcode_protected", item.get("passcode_protected") is True, str(item)[:300])

    print("6. Download is blocked without the passcode grant")
    r = c.get(f"{API}/shares/{share_id}/download", headers=gh)
    check("blocked without passcode", r.status_code == 401 and r.headers.get("x-share-passcode") == "required", f"{r.status_code} {dict(r.headers)}")

    print("7. Wrong passcode is rejected")
    r = c.post(f"{API}/shares/{share_id}/verify", headers=gh, json={"passcode": "nope"})
    check("wrong passcode rejected", r.status_code in (401, 403), f"{r.status_code} {r.text[:200]}")

    print("8. Correct passcode -> safe download")
    r = c.post(f"{API}/shares/{share_id}/verify", headers=gh, json={"passcode": "open-sesame"})
    check("verify passcode", r.status_code == 200, r.text[:300])
    grant = r.json().get("passcode_token") or r.json().get("share_token") or r.json().get("token")
    check("grant returned", bool(grant), str(r.json())[:300])
    r = c.get(f"{API}/shares/{share_id}/download", headers={**gh, "X-Share-Passcode-Token": grant})
    check("download ok", r.status_code == 200, r.text[:200])
    check("decrypted bytes intact", r.content == payload, r.content[:40])

    print("9. Admin Visit")
    r = c.get(f"{API}/admin/security/overview", headers=gh)
    check("non-admin blocked from admin API", r.status_code == 403, r.status_code)

    r = c.post(f"{API}/admin-visit/unlock", headers=gh, json={"password": "wrong"})
    check("wrong admin password rejected", r.status_code == 401, r.text[:200])

    r = c.post(f"{API}/admin-visit/unlock", headers=gh, json={"password": "123meadmin"})
    check("admin visit unlock", r.status_code == 200, r.text[:300])
    visit = r.json()["admin_token"]

    r = c.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {visit}"})
    check("admin-visit token is NOT an access token", r.status_code == 401, r.status_code)

    ah = {**gh, "X-Admin-Visit": visit}
    r = c.get(f"{API}/admin/users", headers=ah)
    check("admin visit grants admin API", r.status_code == 200, r.text[:300])

    print("10. Encryption key registry")
    r = c.get(f"{API}/admin/security/encryption", headers=ah)
    check("registry", r.status_code == 200, r.text[:300])
    reg = r.json()
    row = next((i for i in reg["items"] if i["id"] == fid), None)
    check("file appears in registry", row is not None, str(reg)[:300])
    check("per-file key fingerprint", str(row["key_fingerprint"]).startswith("dek_"), str(row))
    check("kek version present", row["kek_version"] >= 1, str(row))
    check("summary counts files", reg["summary"]["files"] >= 1, str(reg["summary"]))
    check("algorithm AES-256-GCM", reg["summary"]["algorithm"] == "AES-256-GCM", str(reg["summary"]))

    r = c.post(f"{API}/admin/security/encryption/{fid}/verify", headers=ah)
    check("end-to-end verify", r.status_code == 200, r.text[:300])

    print("11. Live alert feed")
    r = c.get(f"{API}/admin/security/live", headers=ah)
    check("live feed", r.status_code == 200, r.text[:300])
    check("live has open counts", "open" in r.json(), str(r.json())[:300])

    r = c.get(f"{API}/admin/security/alerts", headers=ah)
    check("alerts raised by wrong passcode/password", r.status_code == 200 and len(r.json()) >= 1, r.text[:300])

    print("12. Admin Visit lock")
    r = c.post(f"{API}/admin-visit/lock", headers=ah)
    check("lock", r.status_code == 200, r.text[:200])

    print(f"\nALL {ok} CHECKS PASSED")


if __name__ == "__main__":
    main()
