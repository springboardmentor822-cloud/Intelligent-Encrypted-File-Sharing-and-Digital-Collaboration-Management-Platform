"""Suspicious-activity detection RULES (Milestone 3, Task 6).

Every rule has: enabled, threshold, window_seconds, severity (low | medium | high).
The defaults live here; an admin can change them in the "Security Alerts" page, and the changes are saved in MongoDB
(collection `detection_rules`). The detection code asks get_rule() so a change applies within seconds.
"""
import time

from app.core.config import settings
from app.db.mongo import mongo_db

SEVERITY_TO_DB = {"low": "info", "medium": "warning", "high": "critical"}   # how alerts are stored
SEVERITY_FROM_DB = {"info": "low", "warning": "medium", "critical": "high"}  # how the UI shows them


def _defaults() -> dict[str, dict]:
    return {
        "failed_login": dict(name="Repeated failed logins", alert_type="repeated_failed_login", threshold=settings.ALERT_FAILED_THRESHOLD, window_seconds=600, severity="high",
                             description="Failed logins from the same IP address"),
        "unauthorized_access": dict(name="Repeated unauthorized file access", alert_type="repeated_failed_download", threshold=settings.ALERT_FAILED_THRESHOLD, window_seconds=600, severity="high",
                                    description="Failed or forbidden file downloads from the same IP"),
        "excessive_downloads": dict(name="Too many downloads", alert_type="download_burst", threshold=settings.ALERT_DOWNLOAD_BURST, window_seconds=300, severity="medium",
                                    description="Downloads by one user in a short time (possible data theft)"),
        "expired_link_access": dict(name="Expired link access", alert_type="expired_link_access", threshold=3, window_seconds=600, severity="medium",
                                    description="Attempts to use a share link that has expired"),
        "revoked_link_access": dict(name="Revoked link access", alert_type="revoked_link_access", threshold=3, window_seconds=600, severity="medium",
                                    description="Attempts to use a share link that was revoked"),
        "unknown_link_access": dict(name="Guessed link tokens", alert_type="unauthorized_link_access", threshold=settings.ALERT_FAILED_THRESHOLD, window_seconds=600, severity="high",
                                    description="Share-link attempts with tokens that do not exist or wrong passwords"),
        "many_accounts_one_ip": dict(name="One IP tries many accounts", alert_type="suspicious_ip", threshold=settings.ALERT_SUSPICIOUS_IP_ACCOUNTS, window_seconds=600, severity="high",
                                     description="Failed logins on several different accounts from one IP"),
        "admin_account_attack": dict(name="Administrator account under attack", alert_type="admin_account_targeted", threshold=settings.ADMIN_FAIL_THRESHOLD, window_seconds=600, severity="high",
                                     description="Failed logins on an admin account"),
        "unknown_accounts": dict(name="Unknown accounts tried", alert_type="unknown_account_login", threshold=settings.UNKNOWN_ACCOUNT_THRESHOLD, window_seconds=600, severity="medium",
                                 description="Login attempts for e-mails that do not exist"),
        "admin_area_intrusion": dict(name="Non-admin in an admin area", alert_type="admin_access_denied", threshold=1, window_seconds=300, severity="high",
                                     description="A signed-in non-admin opens an admin page or API (one alert per user per window)"),
        "admin_new_ip": dict(name="Admin login from a new IP", alert_type="admin_new_ip", threshold=1, window_seconds=0, severity="medium",
                             description="An administrator signs in from an IP never used before"),
        "policy_violations": dict(name="Repeated upload policy violations", alert_type="policy_violation", threshold=3, window_seconds=600, severity="medium",
                                  description="Uploads rejected for type or size, again and again"),
        "file_threat": dict(name="Dangerous upload blocked", alert_type="file_threat", threshold=1, window_seconds=0, severity="high",
                            description="A file disguised as another type, or carrying a test virus signature"),
        "tripwire_touched": dict(name="Tripwire (trap) file touched", alert_type="tripwire_touched", threshold=1, window_seconds=0, severity="high",
                                 description="Someone opened or downloaded a file that an administrator marked as a trap"),
    }


# rules about ONE attacking IP address: only these can "auto-block" that IP
IP_RULES = {"failed_login", "unauthorized_access", "expired_link_access", "revoked_link_access", "unknown_link_access", "many_accounts_one_ip", "unknown_accounts"}

_cache: dict = {"at": 0.0, "rules": None}


async def get_rules(force: bool = False) -> dict[str, dict]:
    """Defaults + the admin's saved changes. Cached for 15 seconds so busy requests do not hit the database."""
    if not force and _cache["rules"] is not None and time.monotonic() - _cache["at"] < 15:
        return _cache["rules"]
    rules = {rid: {"id": rid, "enabled": True, "auto_block": False, "block_minutes": 15, "can_block": rid in IP_RULES, **r} for rid, r in _defaults().items()}
    try:
        async for saved in mongo_db.detection_rules.find({}):
            r = rules.get(saved["_id"])
            if r:
                for key in ("enabled", "threshold", "window_seconds", "severity", "auto_block", "block_minutes"):
                    if key in saved:
                        r[key] = saved[key]
    except Exception:  # if MongoDB hiccups, keep using the defaults
        pass
    _cache.update(at=time.monotonic(), rules=rules)
    return rules


async def get_rule(rule_id: str) -> dict:
    return (await get_rules())[rule_id]


async def save_rule(rule_id: str, changes: dict) -> dict:
    if rule_id not in _defaults():
        raise KeyError(rule_id)
    clean = {}
    if "enabled" in changes:
        clean["enabled"] = bool(changes["enabled"])
    if "threshold" in changes:
        clean["threshold"] = max(1, min(int(changes["threshold"]), 1000))
    if "window_seconds" in changes:
        clean["window_seconds"] = max(0, min(int(changes["window_seconds"]), 86400))
    if changes.get("severity") in SEVERITY_TO_DB:
        clean["severity"] = changes["severity"]
    if "auto_block" in changes and rule_id in IP_RULES:
        clean["auto_block"] = bool(changes["auto_block"])
    if "block_minutes" in changes:
        clean["block_minutes"] = max(1, min(int(changes["block_minutes"]), 10080))
    await mongo_db.detection_rules.update_one({"_id": rule_id}, {"$set": clean}, upsert=True)
    return (await get_rules(force=True))[rule_id]


async def reset_rule(rule_id: str) -> dict:
    await mongo_db.detection_rules.delete_one({"_id": rule_id})
    return (await get_rules(force=True))[rule_id]
