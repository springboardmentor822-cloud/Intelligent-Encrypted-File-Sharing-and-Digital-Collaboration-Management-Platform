"""Audit logging + suspicious-activity detection.

Every important action calls log_event(): it saves the record in MongoDB (audit_logs), then runs the detection rules
(services/detection.py). Counters live in Redis; when a rule's threshold is crossed, a security alert is saved
(security_alerts) and every admin is notified (in-app + e-mail).
"""
import logging

from fastapi import Request

from app.core.config import settings
from app.core.deps import client_ip
from app.db.mongo import mongo_db
from app.db.redis import redis_client
from app.models.mongo import AuditLogDoc, SecurityAlertDoc
from sqlalchemy import select

from app.db.postgres import SessionLocal
from app.models.postgres import Role, User, UserRole
from app.services.blocklist import block_ip, is_blockable
from app.services.detection import SEVERITY_TO_DB, get_rule
from app.services.geo import lookup_location
from app.services.notifications import notify_admins

logger = logging.getLogger("trustshare.audit")

# Failed actions that count as "unauthorized access attempts" on the admin Security Dashboard
UNAUTHORIZED_ACTIONS = ["download", "view", "delete", "share_access", "permission_grant", "permission_list",
                        "permission_revoke", "share_link_create", "admin_access", "favorite", "restore"]
# Actions that mean a request was BLOCKED before it did anything (rate limit, locked account)
BLOCKED_ACTIONS = ["blocked_request"]


async def create_alert(alert_type: str, message: str, severity: str = "warning",
                       user_id: str | None = None, ip: str | None = None, details: dict | None = None) -> None:
    """Save one security alert and notify every admin. severity here uses the stored words info / warning / critical."""
    alert = SecurityAlertDoc(type=alert_type, severity=severity, message=message,
                             user_id=user_id, ip=ip, details=details or {})
    await mongo_db.security_alerts.insert_one(alert.model_dump())
    logger.warning("SECURITY ALERT [%s] %s ip=%s", alert_type, message, ip)
    await notify_admins(f"Security alert: {alert_type.replace('_', ' ')}", f"{message} (IP: {ip})", ntype="security_alert")


async def is_admin_email(email: str | None) -> bool:
    """Does this e-mail belong to an administrator? (cached 5 minutes so logins stay fast)"""
    if not email:
        return False
    cached = await redis_client.get(f"isadmin:{email}")
    if cached is not None:
        return cached == "1"
    async with SessionLocal() as db:
        row = (await db.execute(select(User.id).join(UserRole, UserRole.user_id == User.id).join(Role, Role.id == UserRole.role_id)
                                .where(User.email == email, Role.name == "admin"))).first()
    await redis_client.set(f"isadmin:{email}", "1" if row else "0", ex=300)
    return bool(row)


async def _fire(rule: dict, message: str, user_id: str | None, ip: str | None, details: dict | None = None) -> None:
    await create_alert(rule["alert_type"], message, SEVERITY_TO_DB[rule["severity"]], user_id, ip, {**(details or {}), "rule": rule["id"]})
    # Automatic response: if the rule says "auto-block", the attacking IP is shut out for a while (private addresses are never blocked)
    if rule.get("auto_block") and ip and is_blockable(ip):
        minutes = rule.get("block_minutes") or 15
        await block_ip(ip, f"Auto-blocked by rule: {rule['name']}", "detection rule", minutes=minutes, auto=True)
        await mongo_db.audit_logs.insert_one(AuditLogDoc(user_email=None, action="ip_blocked", result="success", severity="warning", ip=ip,
                                                          details={"reason": rule["name"], "minutes": minutes, "auto": True}).model_dump())
        await notify_admins("IP address blocked automatically", f"{ip} was blocked for {minutes} minutes by the rule '{rule['name']}'.", ntype="security_alert")


async def _count(key: str, window: int) -> int:
    """Fixed-window counter in Redis: +1, and the first hit starts the timer."""
    n = await redis_client.incr(key)
    if n == 1 and window:
        await redis_client.expire(key, window)
    return n


async def _count_distinct(key: str, value: str, window: int) -> int:
    await redis_client.sadd(key, value)
    if window:
        await redis_client.expire(key, window)
    return await redis_client.scard(key)


def _mins(rule: dict) -> str:
    w = rule["window_seconds"]
    return f"{w // 60} minute{'s' if w // 60 != 1 else ''}" if w >= 60 else f"{w} seconds"


async def _evaluate(doc: dict) -> None:
    """Check ONE new activity against the detection rules (Milestone 3, Task 6, steps 3-5)."""
    action, ip, result = doc["action"], doc.get("ip") or "unknown", doc["result"]
    email, uid = doc.get("user_email"), doc.get("user_id")
    details = doc.get("details") or {}
    reason = details.get("reason")

    # --- logins -----------------------------------------------------------------------------------------------
    if action == "login" and result == "failure":
        r = await get_rule("failed_login")
        if r["enabled"] and await _count(f"fail:login:{ip}", r["window_seconds"]) == r["threshold"]:
            await _fire(r, f"Repeated failed login attempts: {r['threshold']} failures in {_mins(r)}", uid, ip, {"email": email})
        if email:
            r = await get_rule("many_accounts_one_ip")      # one IP, several different accounts
            if r["enabled"] and await _count_distinct(f"failaccounts:{ip}", email, r["window_seconds"]) == r["threshold"]:
                await _fire(r, f"Suspicious IP: failed logins on {r['threshold']} different accounts within {_mins(r)}", None, ip, {})
            if await is_admin_email(email):                  # an administrator's account
                r = await get_rule("admin_account_attack")
                if r["enabled"] and await _count(f"adminfail:{email}", r["window_seconds"]) == r["threshold"]:
                    await _fire(r, f"Administrator account {email} is being attacked: {r['threshold']} failed logins in {_mins(r)}", uid, ip, {"email": email})
            if details.get("account_exists") is False:       # an e-mail that is not registered at all
                r = await get_rule("unknown_accounts")
                if r["enabled"] and await _count_distinct(f"unknownfail:{ip}", email, r["window_seconds"]) == r["threshold"]:
                    await _fire(r, f"Login attempts for {r['threshold']} accounts that do not exist (username guessing)", None, ip, {"email": email})
    if action == "login" and result == "success" and uid and await is_admin_email(email):
        r = await get_rule("admin_new_ip")                   # an administrator from an IP never seen before
        key = f"adminips:{uid}"
        if r["enabled"] and await redis_client.scard(key) and not await redis_client.sismember(key, ip):
            await _fire(r, f"Administrator {email} signed in from a new IP address", uid, ip, {"email": email, "location": doc.get("location")})
        await redis_client.sadd(key, ip)

    # --- admin areas ------------------------------------------------------------------------------------------
    if action == "admin_access" and result == "failure":
        r = await get_rule("admin_area_intrusion")
        who = email or uid or "unknown user"
        if r["enabled"] and await redis_client.set(f"adminintrusion:{who}", "1", ex=max(r["window_seconds"], 1), nx=True):
            path = details.get("path", "an admin area")
            await _fire(r, f"Non-admin user {who} tried to open an admin area ({path})", uid, ip, {"email": email, "path": path})

    # --- files ------------------------------------------------------------------------------------------------
    if action in ("download", "view") and result == "failure":
        r = await get_rule("unauthorized_access")           # repeated attempts at files they may not open
        if r["enabled"] and await _count(f"fail:file:{ip}", r["window_seconds"]) == r["threshold"]:
            await _fire(r, f"Repeated unauthorized file access: {r['threshold']} denied attempts in {_mins(r)}", uid, ip, {"email": email})
    if action in ("download", "share_download") and result == "success":
        r = await get_rule("excessive_downloads")
        if r["enabled"] and await _count(f"burst:{uid or 'ip:' + ip}", r["window_seconds"]) == r["threshold"]:
            await _fire(r, f"{r['threshold']} downloads within {_mins(r)} by one {'user' if uid else 'visitor'}", uid, ip, {"email": email})

    # --- share links ------------------------------------------------------------------------------------------
    if action == "share_access" and result == "failure":
        rule_id = {"expired": "expired_link_access", "revoked": "revoked_link_access"}.get(reason, "unknown_link_access"
                                                                                           if reason in ("unknown_token", "wrong_password") else None)
        if rule_id:
            r = await get_rule(rule_id)
            if r["enabled"] and await _count(f"fail:{rule_id}:{ip}", r["window_seconds"]) == r["threshold"]:
                what = {"expired_link_access": "expired", "revoked_link_access": "revoked"}.get(rule_id, "invalid")
                await _fire(r, f"Repeated attempts to open {what} share links: {r['threshold']} in {_mins(r)}", None, ip, {"reason": reason})

    # --- uploads ----------------------------------------------------------------------------------------------
    category = details.get("category")
    if action == "upload" and result == "failure" and category == "file_threat":
        r = await get_rule("file_threat")
        if r["enabled"]:
            await _fire(r, f"Potentially dangerous upload blocked: {reason}", uid, ip, {"file": details.get("file")})
    if action == "upload" and result == "failure" and category == "policy_violation":
        r = await get_rule("policy_violations")
        if r["enabled"] and await _count(f"policy:{uid or ip}", r["window_seconds"]) == r["threshold"]:
            await _fire(r, f"Repeated upload policy violations ({r['threshold']} in {_mins(r)})", uid, ip, {"email": email})


async def log_event(
    action: str,
    request: Request | None = None,
    *,
    user=None,
    user_id: str | None = None,
    user_email: str | None = None,
    owner_id: str | None = None,
    result: str = "success",
    severity: str | None = None,
    resource_type: str | None = None,
    resource_id: str | None = None,
    details: dict | None = None,
    ip: str | None = None,
) -> None:
    if user is not None:
        user_id, user_email = user.id, user.email
    doc = AuditLogDoc(
        action=action,
        result=result,
        severity=severity or ("warning" if result == "failure" else "info"),
        user_id=user_id,
        user_email=user_email,
        owner_id=owner_id,
        ip=ip or (client_ip(request) if request else None),
        user_agent=(request.headers.get("user-agent", "")[:300] if request else None),
        resource_type=resource_type,
        resource_id=resource_id,
        details=details or {},
    ).model_dump()
    if action == "login":  # location is looked up for logins only (keeps every other request fast)
        doc["location"] = await lookup_location(doc["ip"])
    try:
        await mongo_db.audit_logs.insert_one(dict(doc))
        await _evaluate(doc)
    except Exception as exc:  # logging must never crash a request
        logger.error("Audit logging failed: %s", type(exc).__name__)
