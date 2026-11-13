"""v2 — separate admin portal, per-user security centre, key rotation, wrong-password trigger, Mongo mirror."""
from app.config import get_settings
from .conftest import PDF, make_user, upload


def _fid(client, h):
    return client.get("/api/files", headers=h).json()["items"][0]["id"]


def test_my_security_overview_is_scoped_to_caller(client, alice, bob):
    upload(client, alice, "mine.pdf")
    a = client.get("/api/my-security/overview", headers=alice)
    assert a.status_code == 200, a.text
    assert a.json()["files"]["total"] == 1 and a.json()["files"]["algorithm"] == "AES-256-GCM"
    b = client.get("/api/my-security/overview", headers=bob).json()
    assert b["files"]["total"] == 0
    assert client.get("/api/my-security/overview").status_code == 401


def test_wrong_password_notifies_account_owner(client, alice):
    for _ in range(3):
        assert client.post("/api/auth/login", json={"email": "alice@example.com", "password": "nope-nope-1"}).status_code == 401
    titles = [n["title"] for n in client.get("/api/notifications", headers=alice).json()["items"]]
    assert "Wrong password entered on your account" in titles
    assert "Repeated wrong-password attempts on your account" in titles
    pt = client.get("/api/my-security/overview", headers=alice).json()["password_trigger"]
    assert pt["failed_in_window"] >= 3 and pt["state"] == "alert" and pt["recent_failed"]


def test_data_key_rotation_keeps_file_readable_and_is_audited(client, alice, bob):
    original = upload(client, alice, "rot.pdf").json()
    fid = original["id"] if "id" in original else _fid(client, alice)
    before = client.get(f"/api/files/{fid}/download", headers=alice).content
    r = client.post("/api/my-security/keys/rotate", headers=alice, json={"mode": "data_key", "file_ids": [fid]})
    assert r.status_code == 200 and r.json()["rotated"] == 1 and not r.json()["failed"], r.text
    assert client.get(f"/api/files/{fid}/download", headers=alice).content == before == PDF
    row = client.get("/api/my-security/keys", headers=alice).json()["files"][0]
    assert row["last_rotated"] and not row["due"]
    # another user cannot rotate (or even see) alice's file
    assert client.post("/api/my-security/keys/rotate", headers=bob, json={"mode": "data_key", "file_ids": [fid]}).status_code == 404
    assert client.post("/api/my-security/keys/rotate", headers=alice, json={"mode": "bogus"}).status_code == 422


def test_rewrap_mode_and_due_filter(client, alice):
    upload(client, alice, "rw.pdf")
    r = client.post("/api/my-security/keys/rotate", headers=alice, json={"mode": "rewrap", "only_due": True})
    assert r.status_code == 200 and r.json()["rotated"] == 0     # freshly uploaded => not due
    r = client.post("/api/my-security/keys/rotate", headers=alice, json={"mode": "rewrap"})
    assert r.json()["rotated"] == 1


def test_admin_visit_gate_can_be_disabled(client, alice, monkeypatch):
    monkeypatch.setattr(get_settings(), "admin_visit_enabled", False)
    assert client.post("/api/admin-visit/unlock", headers=alice, json={"password": "123meadmin"}).status_code == 404
    assert client.get("/api/admin/users", headers=alice).status_code == 403


def test_admin_cannot_be_reached_by_standard_user(client, alice, admin):
    assert client.get("/api/admin/users", headers=alice).status_code == 403
    assert client.get("/api/admin/users", headers=admin).status_code == 200
