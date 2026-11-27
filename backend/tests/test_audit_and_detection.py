import os

from app.services import detection_rules as rules
from app.services.audit_helpers import category_of, derive_status, describe


def test_status_derivation():
    assert derive_status("file.upload") == "success"
    assert derive_status("file.upload_rejected") == "failed"
    assert derive_status("auth.login_failed") == "failed"
    assert derive_status("access.unauthorized") == "failed"
    assert derive_status("access.blocked") == "failed"
    assert derive_status("share.link_created") == "success"


def test_category():
    assert category_of("file.download") == "file"
    assert category_of("auth.login") == "auth"
    assert category_of("") == "other"


def test_descriptions_are_readable():
    assert describe("file.upload", {"name": "report.pdf"}) == "Uploaded a file: report.pdf"
    assert "with bob@x.com" in describe("share.user_shared", {"with": "bob@x.com"})
    assert describe("some.new_action") == "Some new action"
    assert "invalid credentials" in describe("auth.login_failed", {"email": "a@b.com", "reason": "invalid_credentials"})


def test_reason_classification():
    assert rules.classify_reason("share link expired") == "expired_link"
    assert rules.classify_reason("share link revoked") == "revoked_link"
    assert rules.classify_reason("invalid share token") == "invalid_link"
    assert rules.classify_reason("download access denied") == "unauthorized"
    assert rules.classify_reason("role 'user' not allowed") == "unauthorized"
    assert rules.classify_reason("share link lacks download permission") == "unauthorized"
    assert rules.classify_reason("rate limit exceeded (login)") is None
    assert rules.classify_reason("") is None


def test_thresholds_read_environment():
    os.environ["DETECT_UNAUTHORIZED_MAX"] = "7"
    os.environ["DETECT_WINDOW_SECONDS"] = "120"
    try:
        assert rules.unauthorized_max() == 7 and rules.window_seconds() == 120
        os.environ["DETECT_UNAUTHORIZED_MAX"] = "oops"
        assert rules.unauthorized_max() == 3          # a bad value falls back to the default
    finally:
        os.environ.pop("DETECT_UNAUTHORIZED_MAX", None)
        os.environ.pop("DETECT_WINDOW_SECONDS", None)


def test_rules_table_lists_all_five_rules():
    table = rules.rules_table(5, 15, 25)
    assert [r["rule"] for r in table] == ["Failed logins", "Unauthorized access", "Excessive downloads", "Expired link access", "Revoked link access"]
