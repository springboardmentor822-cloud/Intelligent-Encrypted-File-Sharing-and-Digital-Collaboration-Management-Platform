"""Helpers for READING the audit log: filters, human-readable descriptions and username lookup (Milestone 3, Task 2)."""
import re
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.postgres import User

VERBS = {
    "login": "signed in", "logout": "signed out", "register": "created an account", "token_refresh": "refreshed the session",
    "upload": "uploaded", "download": "downloaded", "view": "previewed", "delete": "moved to Trash", "restore": "restored",
    "delete_permanent": "permanently deleted", "folder_create": "created a folder", "folder_delete": "deleted a folder", "favorite": "starred",
    "permission_grant": "shared (gave a person access to)", "permission_revoke": "removed a person's access to", "permission_list": "looked at who can access",
    "share_link_create": "created a share link for", "share_link_revoke": "revoked a share link for", "share_link_expire": "had a share link expire for",
    "share_access": "tried to open a share link for", "share_download": "was downloaded by a link visitor:", "share_view": "was opened by a link visitor:",
    "password_change": "changed the password", "password_reset_request": "asked for a password reset", "password_reset": "reset the password",
    "mfa_enable": "turned on two-factor login", "mfa_disable": "turned off two-factor login", "role_change": "changed a user's role",
    "user_active_change": "enabled or disabled an account", "key_rotation": "rotated the encryption keys", "admin_access": "tried to open an admin area",
    "blocked_request": "was blocked by the rate limiter", "notification_broadcast": "sent an announcement", "security_alert_update": "updated a security alert",
    "detection_rule_change": "changed a detection rule", "audit_export": "exported the audit log",
    "ip_blocked": "blocked an IP address:", "ip_unblocked": "unblocked an IP address:", "access_approve": "approved the account of", "access_reject": "declined the account of",
    "policy_change": "changed the access policy", "tripwire_set": "changed a tripwire on", "storage_check": "checked storage",
}
ACTION_TYPES = sorted(VERBS)

REASONS = {"bad_credentials": "wrong e-mail or password", "bad_otp": "wrong 2FA code", "account_locked": "account locked", "account_disabled": "account disabled",
           "forbidden": "not allowed", "expired": "link expired", "revoked": "link revoked", "unknown_token": "link does not exist",
           "wrong_password": "wrong link password", "exhausted": "download limit reached", "rate_limit": "too many requests"}


def describe(doc: dict) -> str:
    """One readable sentence for an audit record, e.g. "alice@x.com downloaded 'Report.pdf'"."""
    details = doc.get("details") or {}
    who = doc.get("user_email") or "A visitor (not signed in)"
    name = details.get("name") or details.get("file")
    verb = VERBS.get(doc["action"], doc["action"].replace("_", " "))
    text = f"{who} {verb}" if not verb.startswith("was ") else f"'{name}' {verb}" if name else f"A file {verb}"
    if name and not verb.startswith("was "):
        text += f" '{name}'"
    if details.get("simulated"):
        text = "[SIMULATED] " + text
    if doc.get("result") == "failure":
        reason = details.get("reason")
        text += f" - FAILED ({REASONS.get(reason, reason)})" if reason else " - FAILED"
    return text


def parse_day(value: str | None, end: bool = False) -> datetime | None:
    if not value:
        return None
    try:
        d = datetime.fromisoformat(value).replace(tzinfo=timezone.utc)
    except ValueError:
        raise HTTPException(400, "Dates must look like 2026-11-08")
    return d + timedelta(days=1) if end else d


def build_filter(*, user: str | None = None, activity_type: str | None = None, file: str | None = None, status: str | None = None,
                 date_from: str | None = None, date_to: str | None = None, days: int | None = None) -> dict:
    """Turn the filter boxes of the UI into one MongoDB query."""
    clauses: list[dict] = []
    if user:
        clauses.append({"$or": [{"user_id": user}, {"user_email": {"$regex": re.escape(user), "$options": "i"}}]})
    if activity_type:
        clauses.append({"action": activity_type})
    if file:
        rx = {"$regex": re.escape(file), "$options": "i"}
        clauses.append({"$or": [{"resource_id": file}, {"details.name": rx}, {"details.file": rx}]})
    if status in ("success", "failure"):
        clauses.append({"result": status})
    start, end = parse_day(date_from), parse_day(date_to, end=True)
    if not start and days:
        start = datetime.now(timezone.utc) - timedelta(days=days)
    if start or end:
        rng = {}
        if start:
            rng["$gte"] = start
        if end:
            rng["$lt"] = end
        clauses.append({"timestamp": rng})
    return {"$and": clauses} if clauses else {}


async def to_rows(db: AsyncSession, docs: list[dict]) -> list[dict]:
    """Audit documents -> the fields Milestone 3 asks for (log id, user id, username, type, file id, description, status, ip, time)."""
    ids = {d.get("user_id") for d in docs if d.get("user_id")}
    names = {}
    if ids:
        names = {uid: name for uid, name in (await db.execute(select(User.id, User.full_name).where(User.id.in_(ids)))).all()}
    rows = []
    for d in docs:
        ts = d["timestamp"]
        rows.append({
            "log_id": str(d["_id"]), "user_id": d.get("user_id"), "username": names.get(d.get("user_id")) or (d.get("user_email") or "").split("@")[0] or "visitor",
            "user_email": d.get("user_email"), "activity_type": d["action"], "file_id": d.get("resource_id") if d.get("resource_type") in ("file", None) else None,
            "file_name": (d.get("details") or {}).get("name") or (d.get("details") or {}).get("file"), "description": describe(d),
            "status": d["result"], "severity": d.get("severity", "info"), "ip": d.get("ip"), "location": d.get("location"),
            "timestamp": (ts.replace(tzinfo=timezone.utc) if ts.tzinfo is None else ts).isoformat(),
        })
    return rows
