"""Audit + security-event recording. Audit rows are append-only (the app exposes no update/delete path)
and hash-chained: entry_hash = sha256(prev_hash || canonical row). verify_chain() detects edits/deletions
made to the middle of the log. This is tamper-EVIDENCE, not immutability: someone with full DB write access
could rewrite the whole chain; export/ship logs off-host for stronger guarantees."""
import hashlib, json
from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import utcnow
from ..models import AuditLog, SecurityEvent, LoginEvent

_FORBIDDEN = ("password", "token", "secret", "key", "authorization", "cookie", "wrapped", "nonce")


def clean(d: dict | None) -> dict:
    out = {}
    for k, v in (d or {}).items():
        if any(f in k.lower() for f in _FORBIDDEN):
            continue
        out[k] = v if isinstance(v, (int, float, bool, type(None))) else str(v)[:300]
    return out


def client_ip(request: Request | None) -> str | None:
    if request is None:
        return None
    if get_settings().trust_proxy:
        xf = request.headers.get("x-forwarded-for")
        if xf:
            return xf.split(",")[0].strip()
    return request.client.host if request.client else None


def _digest(prev: str, row: AuditLog) -> str:
    body = json.dumps([row.action, row.outcome, row.actor_id, row.owner_id, row.resource_type, row.resource_id,
                       row.ip, row.details, row.created_at.isoformat()], sort_keys=True, default=str)
    return hashlib.sha256((prev + body).encode()).hexdigest()


def audit(db: Session, action: str, *, request: Request | None = None, actor_id: str | None = None,
          owner_id: str | None = None, resource_type: str | None = None, resource_id: str | None = None,
          outcome: str = "success", details: dict | None = None) -> AuditLog:
    last = db.execute(select(AuditLog.entry_hash).order_by(AuditLog.id.desc()).limit(1)).scalar() or ""
    row = AuditLog(action=action, outcome=outcome, actor_id=actor_id, owner_id=owner_id, resource_type=resource_type,
                   resource_id=resource_id, ip=client_ip(request), details=clean(details), prev_hash=last,
                   created_at=utcnow())
    row.entry_hash = _digest(last, row)
    db.add(row); db.commit()
    return row


def verify_chain(db: Session) -> dict:
    prev, n = "", 0
    for row in db.execute(select(AuditLog).order_by(AuditLog.id)).scalars():
        if row.prev_hash != prev or row.entry_hash != _digest(prev, row):
            return {"ok": False, "checked": n, "broken_at_id": row.id}
        prev, n = row.entry_hash, n + 1
    return {"ok": True, "checked": n, "broken_at_id": None}


def security_event(db: Session, category: str, severity: str, description: str, *, request: Request | None = None,
                   user_id: str | None = None, resource: str | None = None, details: dict | None = None,
                   kind: str = "observed", disposition: str = "logged") -> SecurityEvent:
    ev = SecurityEvent(category=category, kind=kind, severity=severity, description=description, user_id=user_id,
                       ip=client_ip(request), resource=resource, details=clean(details), disposition=disposition)
    db.add(ev); db.commit()
    return ev


def denied(db: Session, request: Request, *, user_id: str | None, action: str, resource_type: str | None = None,
           resource_id: str | None = None, owner_id: str | None = None, severity: str = "low",
           description: str = "Access denied", category: str = "unauthorized_access", kind: str = "observed",
           details: dict | None = None):
    """One call records both the audit entry and the security event for an access-denied decision."""
    audit(db, action, request=request, actor_id=user_id, owner_id=owner_id, resource_type=resource_type,
          resource_id=resource_id, outcome="denied", details=details)
    security_event(db, category, severity, description, request=request, user_id=user_id,
                   resource=f"{resource_type}:{resource_id}" if resource_type else None, details=details, kind=kind,
                   disposition="denied" if kind == "observed" else "blocked")


def login_event(db: Session, request: Request, *, email: str | None, user_id: str | None, success: bool,
                reason: str = "", method: str = "password"):
    db.add(LoginEvent(user_id=user_id, email=(email or None), success=success, reason=reason, method=method,
                      ip=client_ip(request), user_agent=(request.headers.get("user-agent") or "")[:255]))
    db.commit()


def raise_alert(db: Session, kind: str, severity: str, title: str, description: str = "", *,
                request: Request | None = None, user_id: str | None = None, email: str | None = None,
                resource: str | None = None, details: dict | None = None, rule: str | None = None) -> "SecurityAlert":
    """Create an actionable alert for the Security Dashboard. Alerts are distinct from audit rows:
    audit answers 'what happened', alerts answer 'what needs attention'."""
    from ..models import SecurityAlert
    a = SecurityAlert(kind=kind, severity=severity, title=title[:160], description=description[:400], user_id=user_id,
                      email=(email or None), ip=client_ip(request), resource=resource, details=clean(details), rule=rule)
    db.add(a); db.commit()
    return a
