"""Simple, configurable rules for suspicious activity."""
from datetime import datetime, timedelta, timezone

RULES = {
    "failed_logins": {"activity": "login_failed", "threshold": 5, "minutes": 10, "severity": "high"},
    "excessive_downloads": {"activity": "download", "threshold": 20, "minutes": 5, "severity": "medium"},
    "unauthorized_access": {"activity": "unauthorized_access", "threshold": 3, "minutes": 10, "severity": "high"},
    "expired_link_attempts": {"activity": "expired_link_access", "threshold": 3, "minutes": 30, "severity": "medium"},
    "revoked_link_attempts": {"activity": "revoked_link_access", "threshold": 3, "minutes": 30, "severity": "high"},
}

def detect(conn, event):
    """Return newly triggered alerts for an event; windows are evaluated per user and IP."""
    now = datetime.now(timezone.utc)
    alerts = []
    for key, rule in RULES.items():
        if event["activity_type"] != rule["activity"]:
            continue
        start = (now - timedelta(minutes=rule["minutes"])).isoformat()
        count = conn.execute(
            "SELECT COUNT(*) FROM activities WHERE activity_type=? AND timestamp>=? AND "
            "((user_id IS NOT NULL AND user_id=?) OR (ip_address IS NOT NULL AND ip_address=?))",
            (rule["activity"], start, event.get("user_id"), event.get("ip_address")),
        ).fetchone()[0]
        if count >= rule["threshold"]:
            alerts.append({"rule": key, "count": count, "threshold": rule["threshold"], "severity": rule["severity"]})
    return alerts
