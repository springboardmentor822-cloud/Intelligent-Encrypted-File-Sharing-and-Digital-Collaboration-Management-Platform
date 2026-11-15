"""Tests for the Milestone 2 + mentor-requested features that need no running database."""
import asyncio
from datetime import timedelta
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app.core.validation import EICAR, UploadValidationError, category_for_mime, chart_group, validate_upload
from app.main import app
from app.models.postgres import utcnow
from app.routers.share import link_status
from app.services.geo import lookup_location

client = TestClient(app)


# ---------- file threat / policy detection (feeds the Security Dashboard) ----------
def test_eicar_test_virus_is_a_file_threat():
    with pytest.raises(UploadValidationError) as e:
        validate_upload("notes.txt", "text/plain", EICAR)
    assert e.value.category == "file_threat"


def test_program_disguised_as_pdf_is_a_file_threat():
    with pytest.raises(UploadValidationError) as e:
        validate_upload("invoice.pdf", "application/pdf", b"MZ\x90\x00 this is a Windows program")
    assert e.value.category == "file_threat"


def test_wrong_extension_is_only_a_policy_violation():
    with pytest.raises(UploadValidationError) as e:
        validate_upload("tool.exe", "application/octet-stream", b"hello")
    assert e.value.category == "policy_violation"


# ---------- share-link states ----------
def _link(**kw):
    base = dict(revoked=False, expires_at=utcnow() + timedelta(hours=1), max_downloads=None, download_count=0)
    base.update(kw)
    return SimpleNamespace(**base)


def test_link_states():
    assert link_status(_link()) == "active"
    assert link_status(_link(revoked=True)) == "revoked"
    assert link_status(_link(expires_at=utcnow() - timedelta(seconds=1))) == "expired"
    assert link_status(_link(max_downloads=2, download_count=2)) == "exhausted"


# ---------- location lookup ----------
def test_private_ip_is_local_network_and_bad_ip_is_unknown():
    assert asyncio.run(lookup_location("127.0.0.1")) == "Local network"
    assert asyncio.run(lookup_location("192.168.1.20")) == "Local network"
    assert asyncio.run(lookup_location("not-an-ip")) == "Unknown"


# ---------- every new route exists and is locked ----------
NEW_PATHS = ["/files/{file_id}/favorite", "/files/{file_id}/restore", "/files/{file_id}/permanent", "/files/trash/empty",
             "/share/by-me", "/reports/file-analytics", "/reports/my-security", "/reports/security-dashboard",
             "/auth/token", "/auth/oauth/providers", "/auth/oauth/google/login", "/auth/change-password",
             "/files/counts", "/analytics/largest", "/admin/files", "/admin/shares", "/admin/system",
             "/reports/threat-monitor", "/reports/threat-feed", "/reports/threat-test", "/auth/admin-area-attempt", "/reports/activity-heatmap"]


def test_new_routes_are_registered():  # (milestone 2 + the dashboards)
    paths = client.get("/openapi.json").json()["paths"]
    for p in NEW_PATHS:
        assert p in paths, p


@pytest.mark.parametrize("path", ["/reports/activity-heatmap", "/reports/threat-monitor", "/reports/threat-feed?since=2026-01-01T00:00:00Z", "/admin/files", "/admin/shares", "/admin/system", "/files/counts", "/analytics/largest",
                                  "/reports/file-analytics", "/reports/my-security", "/reports/security-dashboard",
                                  "/share/by-me", "/files?scope=trash", "/files?scope=favorites", "/files?scope=recent"])
def test_new_data_routes_need_a_login(path):
    assert client.get(path).status_code == 401


def test_admin_security_dashboard_rejects_garbage_token():
    r = client.get("/reports/security-dashboard", headers={"Authorization": "Bearer forged.token.value"})
    assert r.status_code == 401


def test_oauth2_token_endpoint_rejects_bad_email_before_touching_the_database():
    r = client.post("/auth/token", data={"username": "not-an-email", "password": "x"})
    assert r.status_code == 422


def test_google_login_is_off_when_not_configured():
    assert client.get("/auth/oauth/google/login", follow_redirects=False).status_code == 404


# ---------- video support + chart groups (the mockup's Documents / Images / Videos / Others) ----------
def test_mp4_is_accepted_and_fake_mp4_is_a_threat():
    ok = b"\x00\x00\x00\x18ftypmp42" + b"\x00" * 32
    assert validate_upload("clip.mp4", "video/mp4", ok) == ("clip.mp4", "video/mp4")
    with pytest.raises(UploadValidationError) as e:
        validate_upload("clip.mp4", "video/mp4", b"just text pretending to be a video")
    assert e.value.category == "file_threat"


def test_chart_groups():
    assert chart_group("application/pdf") == "documents"
    assert chart_group("image/png") == "images"
    assert chart_group("video/mp4") == "videos"
    assert chart_group("application/zip") == "others"
    assert category_for_mime("video/webm") == "video"


# ---------- Threat Monitor ----------
def test_ip_risk_rules():
    from app.routers.reports import ip_risk
    assert ip_risk(1, 1) == "low"
    assert ip_risk(5, 1) == "medium"          # 5 failures = the alert threshold
    assert ip_risk(10, 1) == "high"           # twice the threshold
    assert ip_risk(2, 3) == "high"            # few failures but 3 different accounts tried


def test_threat_monitor_is_not_open_to_a_forged_token():
    r = client.get("/reports/threat-monitor", headers={"Authorization": "Bearer forged.token.value"})
    assert r.status_code == 401


def test_browser_report_and_test_alert_need_a_login():
    assert client.post("/auth/admin-area-attempt", json={"path": "/admin"}).status_code == 401
    assert client.post("/reports/threat-test").status_code == 401


def test_heatmap_weekday_mapping():
    """MongoDB numbers weekdays 1=Sunday..7=Saturday; our rows are Monday-first."""
    row = lambda dow: (dow + 5) % 7
    assert row(2) == 0      # Monday  -> first row
    assert row(1) == 6      # Sunday  -> last row
    assert row(7) == 5      # Saturday
