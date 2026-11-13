import csv, io
from datetime import timedelta
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import get_db, iso, utcnow
from ..deps import days_between, pct_change, parse_range, require_admin
from ..models import (AuditLog, DownloadRecord, File, KeyRotation, LoginEvent, SecurityAlert, SecurityEvent, Share,
                      User)
from ..serializers import share_status, user_out
from ..services import audit as A
from ..services.encryption import DecryptionError
from ..state import encryption, key_manager, storage

settings = get_settings()
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(require_admin)])
sec = APIRouter(prefix="/api/admin/security", tags=["admin-security"], dependencies=[Depends(require_admin)])


def _page(db, stmt, page, size, fn):
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.execute(stmt.limit(size).offset((page - 1) * size)).all()
    return {"items": [fn(*r) if len(r) > 1 else fn(r[0]) for r in rows], "total": total, "page": page, "page_size": size}


# ---------------- users ----------------
@router.get("/users")
def users(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = select(User)
    if q: stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    stmt = stmt.order_by(User.created_at.desc())
    used = dict(db.execute(select(File.owner_id, func.coalesce(func.sum(File.size), 0)).group_by(File.owner_id)).all())
    return _page(db, stmt, page, page_size, lambda u: {**user_out(u), "storage_used": int(used.get(u.id, 0))})


class AdminUserPatch(BaseModel):
    role: str | None = None
    is_active: bool | None = None
    model_config = {"extra": "forbid"}


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: AdminUserPatch, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u: raise HTTPException(404, "User not found")
    if u.id == admin.id: raise HTTPException(409, "Administrators cannot change their own role or status")
    changes = {}
    if body.role is not None:
        if body.role not in ("user", "admin"): raise HTTPException(422, "Invalid role")
        changes["role"] = f"{u.role}->{body.role}"; u.role = body.role
    if body.is_active is not None:
        changes["is_active"] = f"{u.is_active}->{body.is_active}"; u.is_active = body.is_active
    db.commit()
    A.audit(db, "admin.user_update", request=request, actor_id=admin.id, owner_id=u.id, resource_type="user", resource_id=u.id, details=changes)
    if "role" in changes:
        A.security_event(db, "account_role_change", "medium", f"Role changed for {u.email}", request=request, user_id=admin.id, resource=f"user:{u.id}", details=changes)
    return user_out(u)


# ---------------- files / sharing (metadata only; admins cannot read file contents) ----------------
@router.get("/files")
def admin_files(q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = select(File, User).join(User, User.id == File.owner_id)
    if q: stmt = stmt.where(File.original_name.ilike(f"%{q}%"))
    stmt = stmt.order_by(File.created_at.desc())
    return _page(db, stmt, page, page_size, lambda f, u: {"id": f.id, "name": f.original_name, "size": f.size, "category": f.category, "owner": u.email,
                 "created_at": iso(f.created_at), "trashed": bool(f.deleted_at), "encrypted": True, "kek_version": f.kek_version})


@router.get("/sharing")
def admin_sharing(page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    now = utcnow()
    stmt = select(Share, File, User).join(File, File.id == Share.file_id).join(User, User.id == Share.owner_id).order_by(Share.created_at.desc())
    out = _page(db, stmt, page, page_size, lambda s, f, u: {"id": s.id, "file": f.original_name, "owner": u.email, "kind": s.kind, "permission": s.permission,
                "status": share_status(s, now), "expires_at": iso(s.expires_at), "uses": s.use_count, "created_at": iso(s.created_at),
                "passcode_protected": bool(s.passcode_hash)})
    out["totals"] = {"all": db.scalar(select(func.count()).select_from(Share)),
                     "active": db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_(None), Share.expires_at > now)),
                     "expired": db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_(None), Share.expires_at <= now)),
                     "revoked": db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_not(None)))}
    return out


@router.get("/analytics")
def admin_analytics(start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    s, e = parse_range(start, end); days = days_between(s, e)
    now = utcnow()
    def series(col, model, *w):
        m = {d: 0 for d in days}
        for (ts,) in db.execute(select(col).where(*w, col >= s, col < e)): m[ts.date().isoformat()] += 1
        return [{"date": d, "count": m[d]} for d in days]
    total_users = db.scalar(select(func.count()).select_from(User))
    active_users = db.scalar(select(func.count()).select_from(User).where(User.is_active == True))  # noqa: E712
    active_30d = db.scalar(select(func.count()).select_from(User).where(User.last_login_at >= now - timedelta(days=30))) or 0
    total_files = db.scalar(select(func.count()).select_from(File))
    storage_bytes = int(db.scalar(select(func.coalesce(func.sum(File.size), 0))) or 0)
    total_quota = int(db.scalar(select(func.coalesce(func.sum(User.quota_bytes), 0))) or 0)
    failed_logins = db.scalar(select(func.count()).select_from(LoginEvent).where(LoginEvent.success == False,  # noqa: E712
                                                                                 LoginEvent.created_at >= s, LoginEvent.created_at < e)) or 0
    unauth = db.scalar(select(func.count()).select_from(SecurityEvent).where(
        SecurityEvent.category == "unauthorized_access", SecurityEvent.created_at >= s, SecurityEvent.created_at < e)) or 0
    shares_all = db.scalar(select(func.count()).select_from(Share)) or 0
    shares_active = db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_(None), Share.expires_at > now)) or 0
    shares_expired = db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_(None), Share.expires_at <= now)) or 0
    shares_revoked = db.scalar(select(func.count()).select_from(Share).where(Share.revoked_at.is_not(None))) or 0
    return {"users": total_users, "files": total_files,
            "active_users": active_users, "active_users_30d": active_30d,
            "storage_bytes": storage_bytes, "total_quota_bytes": total_quota,
            "storage_utilization_pct": round(storage_bytes / total_quota * 100, 2) if total_quota else None,
            "failed_logins": failed_logins, "unauthorized_attempts": unauth,
            "shares": {"all": shares_all, "active": shares_active, "expired": shares_expired, "revoked": shares_revoked},
            "signups": series(User.created_at, User), "uploads": series(File.created_at, File),
            "downloads": series(DownloadRecord.created_at, DownloadRecord, DownloadRecord.action == "download"),
            "share_activity": series(Share.created_at, Share)}


@router.get("/system")
def system(db: Session = Depends(get_db)):
    try:
        db.execute(select(1)); dbok = True
    except Exception: dbok = False
    try: st = storage().check()
    except Exception as ex: st = {"backend": storage().name, "ok": False, "error": type(ex).__name__}
    return {"database": {"ok": dbok, "engine": db.bind.dialect.name}, "storage": st,
            "encryption": {"algorithm": "AES-256-GCM", "active_key_version": key_manager.active_version, "key_source": key_manager.mode},
            "counts": {"users": db.scalar(select(func.count()).select_from(User)), "files": db.scalar(select(func.count()).select_from(File)),
                       "audit_entries": db.scalar(select(func.count()).select_from(AuditLog))},
            "rate_limiting": {"enabled": settings.rate_limit_enabled, "scope": "in-process (single instance)"},
            "email": {"enabled": settings.notifications_email_enabled,
                      "configured": bool(settings.notifications_email_enabled and settings.smtp_host),
                      "host": settings.smtp_host or None, "port": settings.smtp_port,
                      "from": settings.smtp_from, "starttls": settings.smtp_starttls, "ssl": settings.smtp_ssl},
            "environment": settings.env, "https_enforced": settings.https_enforced}


# ---------------- key management ----------------
@router.get("/keys")
def keys(db: Session = Depends(get_db)):
    dist = dict(db.execute(select(File.kek_version, func.count()).group_by(File.kek_version)).all())
    hist = db.scalars(select(KeyRotation).order_by(KeyRotation.id.desc()).limit(20)).all()
    return {"active_version": key_manager.active_version, "available_versions": sorted(key_manager.keys), "files_by_version": dist,
            "source": key_manager.mode, "automatic_rotation": False,
            "history": [{"from": h.from_version, "to": h.to_version, "files_rewrapped": h.files_rewrapped, "at": iso(h.created_at)} for h in hist]}


class RotateIn(BaseModel):
    new_version: int | None = None   # must already be provisioned in TS_MASTER_KEYS; omitted => dev helper creates one


@router.post("/keys/rotate")
def rotate(body: RotateIn, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Re-wraps every file's data key under the new KEK. Ciphertext objects are not rewritten; old KEKs must be retained
    until every file reports the new version (see /keys files_by_version)."""
    old = key_manager.active_version
    try:
        new = body.new_version or key_manager.add_dev_key()
    except RuntimeError as ex:
        raise HTTPException(409, str(ex))
    if new not in key_manager.keys: raise HTTPException(422, "That key version is not provisioned")
    key_manager.active_version = new
    n = 0
    try:
        for f in db.scalars(select(File)):
            f.wrapped_dek, f.kek_version = encryption.rewrap(f.wrapped_dek, f.kek_version, f.id); n += 1
        db.add(KeyRotation(from_version=old, to_version=new, files_rewrapped=n, actor_id=admin.id)); db.commit()
    except DecryptionError:
        db.rollback(); key_manager.active_version = old
        raise HTTPException(500, "Rotation aborted: a data key could not be unwrapped. No changes were saved.")
    A.audit(db, "key.rotate", request=request, actor_id=admin.id, resource_type="key", resource_id=str(new), details={"from": old, "to": new, "files": n})
    A.security_event(db, "key_rotation", "informational", f"Master key rotated v{old} -> v{new} ({n} files re-wrapped)", request=request, user_id=admin.id)
    return {"from": old, "to": new, "files_rewrapped": n}


# ---------------- security dashboard ----------------
def _range_counts(db, s, e):
    L = lambda *w: db.scalar(select(func.count()).select_from(LoginEvent).where(LoginEvent.created_at >= s, LoginEvent.created_at < e, *w)) or 0
    S = lambda *w: db.scalar(select(func.count()).select_from(SecurityEvent).where(SecurityEvent.created_at >= s, SecurityEvent.created_at < e, *w)) or 0
    return {"total_logins": L(), "successful_logins": L(LoginEvent.success == True), "failed_logins": L(LoginEvent.success == False),  # noqa: E712
            "unauthorized_attempts": S(SecurityEvent.category == "unauthorized_access"), "security_events": S()}


@sec.get("/overview")
def overview(start: str | None = None, end: str | None = None, db: Session = Depends(get_db)):
    s, e = parse_range(start, end); days = days_between(s, e)
    cur, prev = _range_counts(db, s, e), _range_counts(db, s - (e - s), s)
    cards = {k: {"value": v, "previous": prev[k], "change_pct": pct_change(v, prev[k])} for k, v in cur.items()}
    ok = {d: 0 for d in days}; bad = {d: 0 for d in days}
    for succ, ts in db.execute(select(LoginEvent.success, LoginEvent.created_at).where(LoginEvent.created_at >= s, LoginEvent.created_at < e)):
        (ok if succ else bad)[ts.date().isoformat()] += 1
    un = {d: 0 for d in days}; bl = {d: 0 for d in days}
    for cat, kind, ts in db.execute(select(SecurityEvent.category, SecurityEvent.kind, SecurityEvent.created_at).where(SecurityEvent.created_at >= s, SecurityEvent.created_at < e)):
        if kind == "blocked": bl[ts.date().isoformat()] += 1
        elif cat == "unauthorized_access": un[ts.date().isoformat()] += 1
    cats = db.execute(select(SecurityEvent.category, func.count()).where(SecurityEvent.created_at >= s, SecurityEvent.created_at < e).group_by(SecurityEvent.category).order_by(func.count().desc())).all()
    open_alerts = db.scalar(select(func.count()).select_from(SecurityAlert).where(SecurityAlert.status == "open")) or 0
    alerts_24h = db.scalar(select(func.count()).select_from(SecurityAlert).where(SecurityAlert.created_at >= utcnow() - timedelta(hours=24))) or 0
    sev = dict(db.execute(select(SecurityAlert.severity, func.count()).where(SecurityAlert.status == "open").group_by(SecurityAlert.severity)).all())
    alert_series = {d: 0 for d in days}
    for (ts,) in db.execute(select(SecurityAlert.created_at).where(SecurityAlert.created_at >= s, SecurityAlert.created_at < e)):
        alert_series[ts.date().isoformat()] += 1
    return {"range": {"start": s.date().isoformat(), "end": (e - timedelta(days=1)).date().isoformat()}, "cards": cards,
            "open_alerts": open_alerts, "alerts_24h": alerts_24h,
            "alerts_by_severity": {k: sev.get(k, 0) for k in ("critical", "high", "medium", "low")},
            "alerts_series": [{"date": d, "alerts": alert_series[d]} for d in days],
            "login_series": [{"date": d, "successful": ok[d], "failed": bad[d]} for d in days],
            "access_series": [{"date": d, "unauthorized": un[d], "blocked": bl[d]} for d in days],
            "event_categories": [{"category": c, "count": n} for c, n in cats],
            "definitions": {"unauthorized": "Request denied because the caller lacked authentication or permission (401/403).",
                            "blocked": "Request stopped by a specific policy control: rate limit, or an expired/revoked/exhausted/invalid share link."},
            "success_rate_pct": round(cur["successful_logins"] / cur["total_logins"] * 100, 1) if cur["total_logins"] else None}


def _login_stmt(start, end, status, user_id, q):
    s, e = parse_range(start, end)
    stmt = select(LoginEvent).where(LoginEvent.created_at >= s, LoginEvent.created_at < e)
    if status in ("success", "failed"): stmt = stmt.where(LoginEvent.success == (status == "success"))
    if user_id: stmt = stmt.where(LoginEvent.user_id == user_id)
    if q: stmt = stmt.where(LoginEvent.email.ilike(f"%{q}%"))
    return stmt


@sec.get("/logins")
def logins(start: str | None = None, end: str | None = None, status: str | None = None, user_id: str | None = None, q: str | None = None,
           sort: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = _login_stmt(start, end, status, user_id, q)
    stmt = stmt.order_by(LoginEvent.id.asc() if sort == "asc" else LoginEvent.id.desc())
    names = {u.id: u.full_name for u in db.scalars(select(User))}
    return _page(db, stmt, page, page_size, lambda l: {"id": l.id, "user": names.get(l.user_id) or "Unknown user", "user_id": l.user_id, "email": l.email,
                 "ip": l.ip, "status": "success" if l.success else "failed", "reason": l.reason, "method": l.method, "user_agent": l.user_agent,
                 "location": None, "created_at": iso(l.created_at)})


def _event_stmt(start, end, severity, category, user_id, kind):
    s, e = parse_range(start, end)
    stmt = select(SecurityEvent).where(SecurityEvent.created_at >= s, SecurityEvent.created_at < e)
    if severity: stmt = stmt.where(SecurityEvent.severity == severity)
    if category: stmt = stmt.where(SecurityEvent.category == category)
    if user_id: stmt = stmt.where(SecurityEvent.user_id == user_id)
    if kind: stmt = stmt.where(SecurityEvent.kind == kind)
    return stmt


def _ev(x): return {"id": x.id, "category": x.category, "kind": x.kind, "severity": x.severity, "description": x.description, "user_id": x.user_id,
                    "ip": x.ip, "resource": x.resource, "details": x.details, "disposition": x.disposition, "created_at": iso(x.created_at)}


@sec.get("/events")
def events(start: str | None = None, end: str | None = None, severity: str | None = None, category: str | None = None, user_id: str | None = None,
           kind: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    return _page(db, _event_stmt(start, end, severity, category, user_id, kind).order_by(SecurityEvent.id.desc()), page, page_size, _ev)


@sec.get("/events/{event_id}")
def event_detail(event_id: int, db: Session = Depends(get_db)):
    x = db.get(SecurityEvent, event_id)
    if not x: raise HTTPException(404, "Event not found")
    return _ev(x)


# ---------------- audit logs ----------------
def _audit_stmt(start, end, action, outcome, user_id, q):
    s, e = parse_range(start, end, 30)
    stmt = select(AuditLog).where(AuditLog.created_at >= s, AuditLog.created_at < e)
    if action: stmt = stmt.where(AuditLog.action.like(f"{action}%"))
    if outcome: stmt = stmt.where(AuditLog.outcome == outcome)
    if user_id: stmt = stmt.where(AuditLog.actor_id == user_id)
    if q: stmt = stmt.where(or_(AuditLog.action.ilike(f"%{q}%"), AuditLog.resource_id.ilike(f"%{q}%"), AuditLog.ip.ilike(f"%{q}%")))
    return stmt


def _al(r): return {"id": r.id, "action": r.action, "outcome": r.outcome, "actor_id": r.actor_id, "owner_id": r.owner_id, "resource_type": r.resource_type,
                    "resource_id": r.resource_id, "ip": r.ip, "details": r.details, "created_at": iso(r.created_at)}


@sec.get("/audit")
def audit_list(start: str | None = None, end: str | None = None, action: str | None = None, outcome: str | None = None, user_id: str | None = None,
               q: str | None = None, page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    return _page(db, _audit_stmt(start, end, action, outcome, user_id, q).order_by(AuditLog.id.desc()), page, page_size, _al)


def _safe(v):
    v = "" if v is None else str(v)
    return "'" + v if v[:1] in ("=", "+", "-", "@") else v


@sec.get("/audit/export.csv")
def audit_csv(request: Request, start: str | None = None, end: str | None = None, action: str | None = None, outcome: str | None = None,
              user_id: str | None = None, q: str | None = None, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.scalars(_audit_stmt(start, end, action, outcome, user_id, q).order_by(AuditLog.id.desc()).limit(50000)).all()
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["id", "time_utc", "action", "outcome", "actor_id", "owner_id", "resource_type", "resource_id", "ip", "details"])
    for r in rows: w.writerow([r.id, iso(r.created_at), r.action, r.outcome, _safe(r.actor_id), _safe(r.owner_id), r.resource_type, _safe(r.resource_id), r.ip, _safe(r.details)])
    A.audit(db, "audit.export", request=request, actor_id=admin.id, details={"rows": len(rows)})
    return Response(buf.getvalue(), media_type="text/csv", headers={"Content-Disposition": "attachment; filename=trustshare-audit.csv"})


@sec.get("/audit/verify")
def audit_verify(db: Session = Depends(get_db)):
    return A.verify_chain(db)


# ---------------- security alerts + per-user posture (Security Dashboard) ----------------
def _alert_out(a: SecurityAlert) -> dict:
    return {"id": a.id, "kind": a.kind, "severity": a.severity, "title": a.title, "description": a.description,
            "user_id": a.user_id, "email": a.email, "ip": a.ip, "resource": a.resource, "details": a.details,
            "status": a.status, "acknowledged_by": a.acknowledged_by, "acknowledged_at": iso(a.acknowledged_at),
            "created_at": iso(a.created_at)}


@sec.get("/alerts")
def alerts(status: str | None = None, severity: str | None = None, kind: str | None = None, q: str | None = None,
           page: int = Query(1, ge=1), page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    stmt = select(SecurityAlert)
    if status: stmt = stmt.where(SecurityAlert.status == status)
    if severity: stmt = stmt.where(SecurityAlert.severity == severity)
    if kind: stmt = stmt.where(SecurityAlert.kind == kind)
    if q: stmt = stmt.where(or_(SecurityAlert.email.ilike(f"%{q}%"), SecurityAlert.title.ilike(f"%{q}%"),
                                SecurityAlert.ip.ilike(f"%{q}%")))
    stmt = stmt.order_by(SecurityAlert.id.desc())
    out = _page(db, stmt, page, page_size, _alert_out)
    out["counts"] = {"open": db.scalar(select(func.count()).select_from(SecurityAlert).where(SecurityAlert.status == "open")) or 0,
                     "acknowledged": db.scalar(select(func.count()).select_from(SecurityAlert).where(SecurityAlert.status == "acknowledged")) or 0}
    return out


@sec.post("/alerts/{alert_id}/acknowledge")
def acknowledge_alert(alert_id: int, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    a = db.get(SecurityAlert, alert_id)
    if not a: raise HTTPException(404, "Alert not found")
    if a.status != "acknowledged":
        a.status = "acknowledged"; a.acknowledged_by = admin.id; a.acknowledged_at = utcnow(); db.commit()
        A.audit(db, "security.alert_acknowledged", request=request, actor_id=admin.id, owner_id=a.user_id,
                resource_type="alert", resource_id=str(a.id))
    return _alert_out(a)


@sec.post("/alerts/acknowledge-all")
def acknowledge_all(request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    n = db.query(SecurityAlert).filter(SecurityAlert.status == "open").update(
        {SecurityAlert.status: "acknowledged", SecurityAlert.acknowledged_by: admin.id, SecurityAlert.acknowledged_at: utcnow()})
    db.commit()
    A.audit(db, "security.alerts_acknowledged_all", request=request, actor_id=admin.id, details={"count": n})
    return {"ok": True, "acknowledged": n}


@sec.get("/users")
def security_users(q: str | None = None, risk: str | None = None, page: int = Query(1, ge=1),
                   page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    """Per-user security posture for every account."""
    now = utcnow(); since = now - timedelta(days=30)
    stmt = select(User)
    if q: stmt = stmt.where(or_(User.email.ilike(f"%{q}%"), User.full_name.ilike(f"%{q}%")))
    users = db.scalars(stmt.order_by(User.created_at.desc())).all()
    failed = dict(db.execute(select(LoginEvent.user_id, func.count()).where(LoginEvent.success == False,  # noqa: E712
                                   LoginEvent.created_at >= since).group_by(LoginEvent.user_id)).all())
    ok = dict(db.execute(select(LoginEvent.user_id, func.count()).where(LoginEvent.success == True,  # noqa: E712
                                LoginEvent.created_at >= since).group_by(LoginEvent.user_id)).all())
    open_alerts = dict(db.execute(select(SecurityAlert.user_id, func.count()).where(SecurityAlert.status == "open")
                                  .group_by(SecurityAlert.user_id)).all())
    events = dict(db.execute(select(SecurityEvent.user_id, func.count()).where(SecurityEvent.created_at >= since)
                             .group_by(SecurityEvent.user_id)).all())
    files = dict(db.execute(select(File.owner_id, func.count()).group_by(File.owner_id)).all())
    items = []
    for u in users:
        f, a = failed.get(u.id, 0), open_alerts.get(u.id, 0)
        score = min(100, f * 8 + a * 15 + (0 if u.is_active else 10))
        level = "critical" if score >= 60 else "high" if score >= 35 else "medium" if score >= 15 else "low"
        items.append({"id": u.id, "email": u.email, "full_name": u.full_name, "role": u.role, "is_active": u.is_active,
                      "created_at": iso(u.created_at), "last_login_at": iso(u.last_login_at),
                      "failed_logins_30d": f, "successful_logins_30d": ok.get(u.id, 0),
                      "open_alerts": a, "security_events_30d": events.get(u.id, 0), "files": files.get(u.id, 0),
                      "secure_folder_enabled": bool(u.secure_folder_hash),
                      "risk_score": score, "risk_level": level})
    if risk: items = [i for i in items if i["risk_level"] == risk]
    items.sort(key=lambda i: i["risk_score"], reverse=True)
    total = len(items)
    return {"items": items[(page - 1) * page_size: page * page_size], "total": total, "page": page, "page_size": page_size}


@sec.get("/users/{user_id}")
def security_user_detail(user_id: str, db: Session = Depends(get_db)):
    u = db.get(User, user_id)
    if not u: raise HTTPException(404, "User not found")
    since = utcnow() - timedelta(days=30)
    logins = db.scalars(select(LoginEvent).where(LoginEvent.user_id == u.id).order_by(LoginEvent.id.desc()).limit(20)).all()
    evs = db.scalars(select(SecurityEvent).where(SecurityEvent.user_id == u.id).order_by(SecurityEvent.id.desc()).limit(20)).all()
    als = db.scalars(select(SecurityAlert).where(SecurityAlert.user_id == u.id).order_by(SecurityAlert.id.desc()).limit(20)).all()
    return {"user": {**user_out(u), "secure_folder_enabled": bool(u.secure_folder_hash)},
            "logins": [{"id": l.id, "status": "success" if l.success else "failed", "reason": l.reason, "ip": l.ip,
                        "method": l.method, "created_at": iso(l.created_at)} for l in logins],
            "events": [_ev(x) for x in evs], "alerts": [_alert_out(a) for a in als],
            "failed_logins_30d": db.scalar(select(func.count()).select_from(LoginEvent).where(
                LoginEvent.user_id == u.id, LoginEvent.success == False, LoginEvent.created_at >= since)) or 0}


# ---------------- encryption & key registry (Security Dashboard) ----------------
def _key_fingerprint(wrapped: str) -> str:
    """A stable, non-reversible label for a wrapped data key. The raw DEK is never exposed."""
    import hashlib
    return "dek_" + hashlib.sha256((wrapped or "").encode()).hexdigest()[:16]


def _key_status(f: File) -> str:
    if not f.wrapped_dek or not f.nonce:
        return "metadata_missing"
    if f.kek_version not in key_manager.keys:
        return "kek_unavailable"
    if f.kek_version != key_manager.active_version:
        return "stale_kek"
    return "ok"


@sec.get("/encryption")
def encryption_registry(q: str | None = None, status: str | None = None, page: int = Query(1, ge=1),
                        page_size: int = Query(25, ge=1, le=100), db: Session = Depends(get_db)):
    """Per-document encryption record: algorithm, KEK version, wrapped-DEK fingerprint, nonce, state.

    This is the "each document has its own key + encryption data" view. Only fingerprints and
    metadata are shown — never key material.
    """
    stmt = select(File, User).join(User, User.id == File.owner_id)
    if q:
        stmt = stmt.where(or_(File.original_name.ilike(f"%{q}%"), User.email.ilike(f"%{q}%")))
    stmt = stmt.order_by(File.created_at.desc())
    rows = db.execute(stmt).all()
    items = []
    for f, u in rows:
        st = _key_status(f)
        if status and st != status:
            continue
        items.append({"id": f.id, "name": f.original_name, "owner_id": u.id, "owner_email": u.email,
                      "size": f.size, "category": f.category, "secure": bool(f.is_secure),
                      "enc_alg": f.enc_alg, "enc_version": f.enc_version, "kek_version": f.kek_version,
                      "key_fingerprint": _key_fingerprint(f.wrapped_dek), "nonce_b64": f.nonce,
                      "wrapped_dek_bytes": len(f.wrapped_dek or ""), "status": st,
                      "created_at": iso(f.created_at), "last_accessed_at": iso(f.last_accessed_at)})
    total = len(items)
    versions = dict(db.execute(select(File.kek_version, func.count()).group_by(File.kek_version)).all())
    integrity = db.scalar(select(func.count()).select_from(SecurityEvent).where(
        SecurityEvent.category == "integrity_failure")) or 0
    rotations = db.scalar(select(func.count()).select_from(KeyRotation)) or 0
    last_rot = db.scalar(select(KeyRotation).order_by(KeyRotation.id.desc()).limit(1))
    all_files = db.scalar(select(func.count()).select_from(File)) or 0
    stale = sum(n for v, n in versions.items() if v != key_manager.active_version)
    missing = db.scalar(select(func.count()).select_from(File).where(
        or_(File.wrapped_dek == "", File.nonce == ""))) or 0
    return {"items": items[(page - 1) * page_size: page * page_size], "total": total, "page": page,
            "page_size": page_size,
            "summary": {"files": all_files, "unique_data_keys": db.scalar(select(func.count(func.distinct(File.wrapped_dek)))) or 0,
                        "algorithm": "AES-256-GCM", "nonce_bits": 96, "key_bits": 256,
                        "active_kek_version": key_manager.active_version, "kek_source": key_manager.mode,
                        "available_kek_versions": sorted(key_manager.keys), "files_by_kek_version": versions,
                        "stale_key_files": stale, "missing_metadata_files": missing,
                        "integrity_failures": integrity, "rotations": rotations,
                        "last_rotation": iso(last_rot.created_at) if last_rot else None},
            "kek_series": [{"version": f"v{v}", "files": n} for v, n in sorted(versions.items())]}


@sec.post("/encryption/{file_id}/verify")
def verify_file_key(file_id: str, request: Request, admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Unwrap the data key and authenticate the ciphertext end-to-end. A failure raises a critical alert."""
    f = db.get(File, file_id)
    if not f:
        raise HTTPException(404, "File not found")
    try:
        ct = storage().get(f.storage_key)
        data = encryption.decrypt(ct, file_id=f.id, nonce_b64=f.nonce, wrapped_dek=f.wrapped_dek, kek_version=f.kek_version)
    except DecryptionError:
        A.security_event(db, "integrity_failure", "critical", "Key verification failed for an encrypted file",
                         request=request, user_id=admin.id, resource=f"file:{f.id}")
        A.raise_alert(db, "integrity_failure", "critical", "Encrypted file failed key verification",
                      f"'{f.original_name}' could not be decrypted: the data key did not unwrap or the ciphertext "
                      "failed authentication. The object may be corrupted or tampered with.",
                      request=request, user_id=f.owner_id, resource=f"file:{f.id}", details={"file_id": f.id})
        A.audit(db, "file.key_verify", request=request, actor_id=admin.id, owner_id=f.owner_id,
                resource_type="file", resource_id=f.id, outcome="failure")
        raise HTTPException(409, "Key verification failed — the file cannot be decrypted")
    except Exception:
        raise HTTPException(503, "Storage backend unavailable")
    A.audit(db, "file.key_verify", request=request, actor_id=admin.id, owner_id=f.owner_id,
            resource_type="file", resource_id=f.id, details={"bytes": len(data)})
    return {"ok": True, "file_id": f.id, "bytes": len(data), "kek_version": f.kek_version,
            "key_fingerprint": _key_fingerprint(f.wrapped_dek), "verified_at": iso(utcnow())}


@sec.get("/live")
def live(db: Session = Depends(get_db)):
    """Small polling payload that drives the red LED alert indicator. Cheap enough for a 10s poll."""
    latest = db.scalar(select(func.max(SecurityAlert.id))) or 0
    sev = dict(db.execute(select(SecurityAlert.severity, func.count()).where(SecurityAlert.status == "open")
                          .group_by(SecurityAlert.severity)).all())
    recent = db.scalars(select(SecurityAlert).order_by(SecurityAlert.id.desc()).limit(5)).all()
    since = utcnow() - timedelta(hours=24)
    return {"latest_id": latest,
            "open": {"critical": sev.get("critical", 0), "high": sev.get("high", 0),
                     "medium": sev.get("medium", 0), "low": sev.get("low", 0),
                     "total": sum(sev.values())},
            "abnormal_24h": db.scalar(select(func.count()).select_from(SecurityAlert).where(
                SecurityAlert.created_at >= since,
                SecurityAlert.kind.in_(["abnormal_download", "abnormal_activity", "integrity_failure",
                                        "admin_visit_failure", "brute_force"]))) or 0,
            "recent": [_alert_out(a) for a in recent]}
