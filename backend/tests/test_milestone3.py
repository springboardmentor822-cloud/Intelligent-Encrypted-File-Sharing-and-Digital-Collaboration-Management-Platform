"""Milestone 3 tests: they need no running database. They check that every new API exists, is locked behind a login
(and, for admin APIs, cannot be opened with a forged token), and that the pure logic (filters, descriptions, severities) is right."""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.audit_view import ACTION_TYPES, build_filter, describe
from app.services.detection import SEVERITY_FROM_DB, SEVERITY_TO_DB, _defaults

client = TestClient(app)

ADMIN_GET = ["/admin/access/overview", "/audit-logs", "/audit-logs/filter", "/audit-logs/export", "/audit-logs/user/someone", "/audit-logs/file/some-file",
             "/activity/users", "/activity/users/someone", "/security/summary", "/security/events", "/security/rules", "/security/scenarios",
             "/reports/uploads", "/reports/downloads", "/reports/sharing", "/reports/security",
             "/analytics/overview", "/analytics/users/storage", "/analytics/files", "/analytics/downloads", "/analytics/sharing",
             "/admin/notifications/overview"]
USER_GET = ["/notifications/history", "/notifications/preferences", "/notifications", "/reports/my-security-dashboard", "/reports/my-security"]


@pytest.mark.parametrize("path", ADMIN_GET + USER_GET)
def test_every_milestone3_api_needs_a_login(path):
    assert client.get(path).status_code == 401


@pytest.mark.parametrize("path", ADMIN_GET)
def test_admin_apis_reject_a_forged_token(path):
    assert client.get(path, headers={"Authorization": "Bearer forged.token.value"}).status_code == 401


@pytest.mark.parametrize("method,path", [("post", "/security/simulate"), ("post", "/admin/notifications/broadcast"), ("post", "/admin/notifications/test-email"),
                                         ("post", "/notifications/read-all"), ("put", "/admin/access/policy"), ("post", "/admin/access/blocked-ips"), ("post", "/admin/access/users/abc/approve"), ("put", "/admin/access/tripwires/abc"), ("put", "/security/rules/failed_login"), ("patch", "/security/events/abc")])
def test_write_apis_need_a_login(method, path):
    assert getattr(client, method)(path, json={}).status_code == 401


def test_audit_log_api_has_no_edit_or_delete():
    """Audit records must be read-only: only GET routes exist under /audit-logs."""
    spec = client.get("/openapi.json").json()["paths"]
    for path, methods in spec.items():
        if path.startswith("/audit-logs"):
            assert set(methods) == {"get"}, (path, methods)


def test_milestone_endpoint_names_exist():
    spec = client.get("/openapi.json").json()["paths"]
    for path in ["/audit-logs", "/audit-logs/user/{user_id}", "/audit-logs/file/{file_id}", "/audit-logs/filter", "/analytics/storage",
                 "/analytics/users/storage", "/analytics/files", "/analytics/downloads", "/analytics/sharing"]:
        assert path in spec, path


def test_describe_reads_like_a_sentence():
    ok = describe({"action": "download", "result": "success", "user_email": "a@x.com", "details": {"name": "Report.pdf"}})
    assert ok == "a@x.com downloaded 'Report.pdf'"
    bad = describe({"action": "login", "result": "failure", "user_email": "a@x.com", "details": {"reason": "bad_credentials"}})
    assert "FAILED" in bad and "wrong e-mail or password" in bad
    sim = describe({"action": "login", "result": "failure", "user_email": None, "details": {"simulated": True}})
    assert sim.startswith("[SIMULATED]")


def test_filters_build_one_mongo_query():
    assert build_filter() == {}
    q = build_filter(user="a@x.com", activity_type="upload", status="failure", date_from="2026-11-01", date_to="2026-11-07")
    assert len(q["$and"]) == 4
    assert {"action": "upload"} in q["$and"] and {"result": "failure"} in q["$and"]
    assert build_filter(status="nonsense") == {}            # unknown status values are ignored


def test_severity_words_round_trip():
    for low_med_high, stored in SEVERITY_TO_DB.items():
        assert SEVERITY_FROM_DB[stored] == low_med_high


def test_every_rule_has_a_valid_severity_and_alert_type():
    rules = _defaults()
    assert {"failed_login", "unauthorized_access", "excessive_downloads", "expired_link_access", "revoked_link_access"} <= set(rules)
    for r in rules.values():
        assert r["severity"] in SEVERITY_TO_DB and r["alert_type"] and r["threshold"] >= 1


def test_link_expiry_is_an_audit_activity():
    assert "share_link_expire" in ACTION_TYPES and "logout" in ACTION_TYPES


# ---------- version 3.1: storage limit, block list, bootstrap ----------
def test_storage_limit_is_one_gigabyte_for_platform_and_user():
    from app.core.config import settings
    assert settings.STORAGE_LIMIT_MB == 1024
    assert settings.quota_bytes == settings.platform_capacity_bytes == 1024 * 1024 * 1024


def test_private_and_local_addresses_can_never_be_blocked():
    from app.services.blocklist import is_blockable
    for ip in ("127.0.0.1", "192.168.1.5", "10.0.0.9", "172.17.0.1", "::1", "169.254.1.1", "not-an-ip", ""):
        assert not is_blockable(ip), ip
    assert is_blockable("203.0.113.50") and is_blockable("8.8.8.8")     # a normal public address CAN be blocked


def test_detection_rules_know_which_ones_can_auto_block():
    from app.services.detection import IP_RULES, _defaults
    assert IP_RULES <= set(_defaults())
    assert "admin_area_intrusion" not in IP_RULES        # a logged-in user is not an "attacking IP"
    assert "tripwire_touched" in _defaults()


def test_login_page_and_register_are_public_but_admin_access_is_not():
    assert client.get("/auth/oauth/providers").status_code == 200
    assert client.get("/admin/access/overview").status_code == 401
