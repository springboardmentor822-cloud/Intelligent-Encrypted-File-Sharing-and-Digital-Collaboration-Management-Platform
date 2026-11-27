"""Audit logging, login history, security events and download tracking (all in MongoDB).

Logging must never break a user request, so every writer swallows (and logs) storage errors.
"""
import logging
import uuid
from datetime import datetime, timezone

from app.core.mongo import get_mongo
from app.core.request import RequestInfo
from app.services import geoip_service
from app.services.audit_helpers import category_of, derive_status, describe

log = logging.getLogger("trustshare.audit")

# Security event categories (match the Admin Security Dashboard donut)
EVT_MULTIPLE_LOGIN = "Multiple Login Attempts"
EVT_SUSPICIOUS_IP = "Suspicious IP Access"
EVT_UNAUTHORIZED = "Unauthorized Access"
EVT_POLICY = "Policy Violations"
EVT_FILE_THREAT = "Malware/File Threat"
EVT_OTHER = "Others"
EVENT_CATEGORIES = [EVT_MULTIPLE_LOGIN, EVT_SUSPICIOUS_IP, EVT_UNAUTHORIZED, EVT_POLICY, EVT_FILE_THREAT, EVT_OTHER]

SEVERITIES = ("info", "low", "medium", "high", "critical")
EVENT_STATUSES = ("open", "investigating", "resolved")


def now() -> datetime:
    return datetime.now(timezone.utc)


def _s(value) -> str | None:
    return str(value) if value is not None else None


def new_id() -> str:
    return uuid.uuid4().hex


def _safe_insert(collection: str, doc: dict) -> None:
    try:
        get_mongo()[collection].insert_one(doc)
    except Exception:  # noqa: BLE001
        log.exception("Could not write to %s", collection)


def log_audit(action: str, actor=None, resource_type: str | None = None, resource_id=None,
              info: RequestInfo | None = None, details: dict | None = None, owner_id=None,
              status: str | None = None, description: str | None = None) -> None:
    """The single reusable audit writer. `action` is the activity type, e.g. 'file.download'."""
    details = details or {}
    _safe_insert("audit_logs", {
        "log_id": new_id(),
        "ts": now(),
        "action": action,
        "category": category_of(action),
        "status": status or derive_status(action),
        "description": description or describe(action, details),
        "actor_id": _s(getattr(actor, "id", None)),
        "actor_email": getattr(actor, "email", None),
        "actor_name": getattr(actor, "full_name", None),
        "owner_id": _s(owner_id),
        "resource_type": resource_type,
        "resource_id": _s(resource_id),
        "ip": info.ip if info else None,
        "user_agent": info.user_agent if info else None,
        "details": details,
    })


def log_login(email: str, user_id, success: bool, reason: str, info: RequestInfo, name: str | None = None) -> None:
    _safe_insert("login_events", {
        "ts": now(),
        "email": email,
        "user_id": _s(user_id),
        "name": name,
        "status": "success" if success else "failed",
        "reason": reason,
        "ip": info.ip,
        "location": geoip_service.lookup(info.ip),
        "user_agent": info.user_agent,
    })
    if not success:  # successful sign-ins are audited by the auth routes themselves
        _safe_insert("audit_logs", {
            "log_id": new_id(), "ts": now(), "action": "auth.login_failed", "category": "auth", "status": "failed",
            "description": describe("auth.login_failed", {"email": email, "reason": reason}),
            "actor_id": _s(user_id), "actor_email": email, "actor_name": name, "owner_id": None,
            "resource_type": "user", "resource_id": _s(user_id), "ip": info.ip, "user_agent": info.user_agent,
            "details": {"email": email, "reason": reason},
        })


def log_security_event(category: str, severity: str, title: str, info: RequestInfo | None = None,
                       user=None, details: str = "", notify_admins: bool | None = None) -> str:
    """Store a security alert (status 'open') and return its alert id.

    notify_admins: None = notify only for high/critical severity, True = always, False = never.
    """
    alert_id = new_id()
    _safe_insert("security_events", {
        "alert_id": alert_id,
        "ts": now(),
        "category": category,
        "severity": severity,
        "status": "open",
        "title": title,
        "details": details,
        "ip": info.ip if info else None,
        "user_id": _s(getattr(user, "id", None)),
        "user_email": getattr(user, "email", None),
    })
    should_notify = notify_admins if notify_admins is not None else severity in ("high", "critical")
    if should_notify:
        try:
            from app.core.database import SessionLocal
            from app.services import notification_service

            with SessionLocal() as db:
                notification_service.notify_admins(db, "security", f"Security alert: {title}",
                                                   f"{details or title} (IP {info.ip if info else 'n/a'})")
                db.commit()
        except Exception:  # noqa: BLE001
            log.exception("Could not notify admins")
    return alert_id


def log_access_attempt(kind: str, reason: str, info: RequestInfo, user=None) -> None:
    """kind: 'unauthorized' (authenticated but not permitted) or 'blocked' (stopped by a control).

    Also mirrors the attempt into the audit log and runs the suspicious-activity rules.
    """
    _safe_insert("access_attempts", {
        "ts": now(),
        "kind": kind,
        "reason": reason,
        "path": info.path,
        "method": info.method,
        "ip": info.ip,
        "user_id": _s(getattr(user, "id", None)),
        "user_email": getattr(user, "email", None),
    })
    _safe_insert("audit_logs", {
        "log_id": new_id(), "ts": now(), "action": f"access.{kind}", "category": "access", "status": "failed",
        "description": f"{'Unauthorized access attempt' if kind == 'unauthorized' else 'Request blocked'}: {reason}",
        "actor_id": _s(getattr(user, "id", None)), "actor_email": getattr(user, "email", None),
        "actor_name": getattr(user, "full_name", None), "owner_id": None, "resource_type": "request",
        "resource_id": None, "ip": info.ip, "user_agent": info.user_agent,
        "details": {"reason": reason, "path": info.path, "method": info.method},
    })
    try:
        from app.services import detection_service

        detection_service.on_access_attempt(kind, reason, info, user)
    except Exception:  # noqa: BLE001
        log.exception("detection rules failed")


def log_download(file, actor, via: str, info: RequestInfo, share_id=None) -> None:
    """via: owner | direct | link"""
    _safe_insert("download_events", {
        "ts": now(),
        "file_id": _s(file.id),
        "file_name": file.name,
        "size_bytes": file.size_bytes,
        "owner_id": _s(file.owner_id),
        "actor": _s(actor.id) if actor else f"anon:{info.ip}",
        "actor_name": actor.full_name if actor else "Anonymous (share link)",
        "via": via,
        "share_id": _s(share_id),
        "ip": info.ip,
    })


def log_share_event(file_id, kind: str, info: RequestInfo, share_id=None, actor=None, details: str = "") -> None:
    _safe_insert("share_events", {
        "ts": now(), "file_id": _s(file_id), "kind": kind, "share_id": _s(share_id),
        "actor_id": _s(getattr(actor, "id", None)), "ip": info.ip, "details": details,
    })
