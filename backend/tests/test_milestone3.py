"""Milestone 3 — activity monitoring, audit API, notifications, reports, analytics, detection."""
from sqlalchemy import select

from app.db import SessionLocal
from app.models import ActivityRecord, Notification, SecurityAlert
from .conftest import PDF, make_user, upload


def test_activity_recorded_and_queryable(client, alice, admin):
    upload(client, alice, "a.pdf")
    me = client.get("/api/activity/me", headers=alice)
    assert me.status_code == 200, me.text
    types = {i["activity_type"] for i in me.json()["items"]}
    assert {"login", "file_upload"} <= types

    allr = client.get("/api/activity/all", headers=admin)
    assert allr.status_code == 200 and allr.json()["total"] >= 2
    assert client.get("/api/activity/all", headers=alice).status_code == 403

    s = client.get("/api/activity/summary", headers=admin)
    assert s.status_code == 200 and s.json()["total"] >= 2


def test_audit_log_endpoints(client, alice, admin):
    upload(client, alice, "audit.pdf")
    r = client.get("/api/audit-logs", headers=admin)
    assert r.status_code == 200, r.text
    item = r.json()["items"][0]
    assert {"log_id", "user_id", "activity_type", "status", "ip", "created_at"} <= set(item)
    uid = client.get("/api/auth/me", headers=alice).json()["id"]
    assert client.get(f"/api/audit-logs/user/{uid}", headers=admin).status_code == 200
    fid = client.get("/api/files", headers=alice).json()["items"][0]["id"]
    assert client.get(f"/api/audit-logs/file/{fid}", headers=admin).status_code == 200
    f = client.get("/api/audit-logs/filter", headers=admin, params={"activity_type": "file.upload"})
    assert f.status_code == 200 and f.json()["total"] >= 1
    assert client.get("/api/audit-logs", headers=alice).status_code == 403


def test_share_and_download_notifications(client, alice, bob):
    upload(client, alice, "shared.pdf")
    fid = client.get("/api/files", headers=alice).json()["items"][0]["id"]
    r = client.post("/api/shares", headers=alice, json={"file_id": fid, "kind": "user",
                                                        "recipient_email": "bob@example.com",
                                                        "permission": "download", "expires_in_hours": 24})
    assert r.status_code == 201, r.text
    sid = r.json()["id"]
    n = client.get("/api/notifications", headers=bob)
    assert n.status_code == 200 and n.json()["unread"] >= 1
    assert any(i["type"] == "file_shared" for i in n.json()["items"])
    nid = n.json()["items"][0]["id"]
    assert client.post(f"/api/notifications/{nid}/read", headers=bob).status_code == 200
    assert client.get("/api/notifications/unread-count", headers=bob).json()["unread"] == 0

    # Bob downloads via the direct share -> owner gets a notification.
    d = client.get(f"/api/shares/{sid}/download", headers=bob)
    assert d.status_code == 200, d.text
    an = client.get("/api/notifications", headers=alice)
    assert any(i["type"] == "file_downloaded" for i in an.json()["items"])


def test_reports_and_analytics(client, alice, admin):
    upload(client, alice, "r.pdf")
    for path in ("/api/reports/uploads", "/api/reports/downloads", "/api/reports/sharing",
                 "/api/reports/users", "/api/reports/security"):
        r = client.get(path, headers=admin)
        assert r.status_code == 200, (path, r.text)
    assert client.get("/api/reports/uploads", headers=admin).json()["total_uploads"] >= 1
    for path in ("/api/analytics/storage", "/api/analytics/users/storage", "/api/analytics/files",
                 "/api/analytics/downloads", "/api/analytics/sharing"):
        r = client.get(path, headers=admin)
        assert r.status_code == 200, (path, r.text)
    st = client.get("/api/analytics/storage", headers=admin).json()
    assert st["total_files"] >= 1 and st["total_bytes"] > 0


def test_failed_login_detection_rule(client, alice, admin):
    for _ in range(6):
        client.post("/api/auth/login", json={"email": "alice@example.com", "password": "wrong-pass"})
    scan = client.post("/api/security-monitoring/scan", headers=admin)
    assert scan.status_code == 200, scan.text
    with SessionLocal() as db:
        a = db.scalar(select(SecurityAlert).where(SecurityAlert.rule == "failed_logins"))
        assert a is not None
    r = client.get("/api/security-monitoring/suspicious", headers=admin)
    assert r.status_code == 200 and any(i["rule"] == "failed_logins" for i in r.json()["items"])
    ov = client.get("/api/security-monitoring/overview", headers=admin).json()
    assert ov["totals"]["failed_logins"] >= 6
    assert client.get("/api/security-monitoring/rules", headers=admin).json()["rules"]


def test_download_burst_detection(client, alice, admin):
    upload(client, alice, "burst.pdf")
    fid = client.get("/api/files", headers=alice).json()["items"][0]["id"]
    for _ in range(21):
        assert client.get(f"/api/files/{fid}/download", headers=alice).status_code == 200
    with SessionLocal() as db:
        a = db.scalar(select(SecurityAlert).where(SecurityAlert.rule == "download_burst"))
        assert a is not None
    assert client.get("/api/security-monitoring/suspicious", headers=admin,
                      params={"rule": "download_burst"}).json()["total"] >= 1


def test_expired_link_access_detection(client, alice, admin):
    upload(client, alice, "exp.pdf")
    fid = client.get("/api/files", headers=alice).json()["items"][0]["id"]
    r = client.post("/api/shares", headers=alice, json={"file_id": fid, "kind": "link",
                                                        "permission": "download", "expires_in_hours": 1})
    token = r.json()["url"].rsplit("/", 1)[-1]
    # Force expiry.
    from app.db import utcnow
    from app.models import Share
    with SessionLocal() as db:
        s = db.scalar(select(Share))
        s.expires_at = utcnow(); db.commit()
    for _ in range(3):
        assert client.get(f"/api/public/shares/{token}").status_code == 410
    with SessionLocal() as db:
        assert db.scalar(select(SecurityAlert).where(SecurityAlert.rule == "expired_link_access")) is not None
        assert db.scalar(select(ActivityRecord).where(ActivityRecord.activity_type == "share_expired_access"))
