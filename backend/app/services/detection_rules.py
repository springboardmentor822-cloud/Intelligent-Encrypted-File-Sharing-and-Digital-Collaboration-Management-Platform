"""Pure rule definitions for suspicious-activity detection (thresholds come from environment variables)."""
import os


def _int(name: str, default: int) -> int:
    try:
        return int(os.getenv(name, default))
    except ValueError:
        return default


def window_seconds() -> int:
    return _int("DETECT_WINDOW_SECONDS", 600)


def unauthorized_max() -> int:
    return _int("DETECT_UNAUTHORIZED_MAX", 3)


def link_attempts_max() -> int:
    return _int("DETECT_LINK_ATTEMPTS_MAX", 3)


def classify_reason(reason: str) -> str | None:
    """Map an access-attempt reason to a detection bucket, or None if it is not security relevant here."""
    r = (reason or "").lower()
    if "share link expired" in r:
        return "expired_link"
    if "share link revoked" in r:
        return "revoked_link"
    if "invalid share token" in r:
        return "invalid_link"
    if "access denied" in r or "not allowed" in r or "lacks download permission" in r:
        return "unauthorized"
    return None


LINK_LABELS = {"expired_link": "an expired", "revoked_link": "a revoked", "invalid_link": "an invalid"}


def rules_table(login_max: int, login_lock_minutes: int, download_max: int) -> list[dict]:
    w = window_seconds() // 60
    return [
        {"rule": "Failed logins", "condition": f"{login_max} failed sign-ins for one account within {login_lock_minutes} minutes", "severity": "high", "action": "Account locked, admin alerted"},
        {"rule": "Unauthorized access", "condition": f"{unauthorized_max()} denied file/admin requests by one user within {w} minutes", "severity": "high", "action": "Security event, admin alerted"},
        {"rule": "Excessive downloads", "condition": f"more than {download_max} downloads within 10 minutes", "severity": "medium", "action": "Security event"},
        {"rule": "Expired link access", "condition": f"any attempt, and {link_attempts_max()} attempts from one IP within {w} minutes", "severity": "low / medium", "action": "Admin notified"},
        {"rule": "Revoked link access", "condition": f"any attempt, and {link_attempts_max()} attempts from one IP within {w} minutes", "severity": "low / medium", "action": "Admin notified"},
    ]
