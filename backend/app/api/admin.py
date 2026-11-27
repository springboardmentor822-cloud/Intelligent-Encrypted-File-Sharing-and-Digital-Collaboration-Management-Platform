"""Administrator APIs. The router-level dependency enforces role=admin on the server for every route."""
import csv
import io
import json
import re
import time
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import func, or_, select, text
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_admin
from app.core.mongo import get_mongo
from app.core.redis_client import get_redis
from app.core.request import RequestInfo, get_request_info
from app.core.runtime import STARTED_AT
from app.core.security import hash_password, validate_password_strength
from app.models import FileShare, FileVersion, Role, ShareLink, StoredFile, User, utcnow
from app.serializers import file_dict, link_dict, user_dict
from app.services import analytics_service, key_service, notification_service, session_service, storage_service
from app.services import audit_service as audit
from app.services import encryption_service as enc

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(get_admin)])


def _clean(doc: dict) -> dict:
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id"))
    return doc


def _page(coll, flt: dict, page: int, size: int) -> dict:
    page, size = max(page, 1), min(max(size, 1), 200)
    total = coll.count_documents(flt)
    items = [_clean(d) for d in coll.find(flt).sort("ts", -1).skip((page - 1) * size).limit(size)]
    return {"items": items, "total": total, "page": page, "page_size": size}


def _range_filter(start: date | None, end: date | None) -> dict:
    if not (start or end):
        return {}
    s, e = analytics_service.parse_range(start, end)
    lo, hi = analytics_service._bounds(s, e)
    return {"ts": {"$gte": lo, "$lt": hi}}


# ------------------------------------------------------------------ dashboards
@router.get("/overview")
def overview(start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    now = utcnow()
    counts = {
        "users": db.scalar(select(func.count()).select_from(User)),
        "active_users": db.scalar(select(func.count()).select_from(User).where(User.is_active.is_(True))),
        "files": db.scalar(select(func.count()).select_from(StoredFile).where(StoredFile.deleted_at.is_(None))),
        "storage_bytes": int(db.scalar(select(func.coalesce(func.sum(FileVersion.encrypted_size), 0))) or 0),
        "active_links": db.scalar(select(func.count()).select_from(ShareLink).where(
            ShareLink.revoked_at.is_(None), ShareLink.expires_at > now)),
    }
    return {"counts": counts, "files": analytics_service.file_overview(db, None, start, end),
            "security": analytics_service.security_summary(start, end)["metrics"]}


@router.get("/analytics")
def analytics(start: date | None = None, end: date | None = None, db: Session = Depends(get_db)):
    return analytics_service.file_overview(db, None, start, end)


@router.get("/security/summary")
def security_summary(start: date | None = None, end: date | None = None):
    return analytics_service.security_summary(start, end)


@router.get("/security/logins")
def login_history(page: int = 1, page_size: int = 25, status: str | None = None, q: str | None = None,
                  start: date | None = None, end: date | None = None):
    flt = _range_filter(start, end)
    if status in ("success", "failed"):
        flt["status"] = status
    if q:
        flt["$or"] = [{"email": {"$regex": re.escape(q[:80]), "$options": "i"}}, {"ip": {"$regex": re.escape(q[:45])}}]
    return _page(get_mongo().login_events, flt, page, page_size)


@router.get("/security/events")
def security_events(page: int = 1, page_size: int = 25, severity: str | None = None, category: str | None = None,
                    start: date | None = None, end: date | None = None):
    flt = _range_filter(start, end)
    if severity in audit.SEVERITIES:
        flt["severity"] = severity
    if category in audit.EVENT_CATEGORIES:
        flt["category"] = category
    return _page(get_mongo().security_events, flt, page, page_size)


@router.get("/security/access-attempts")
def access_attempts(page: int = 1, page_size: int = 25, kind: str | None = None,
                    start: date | None = None, end: date | None = None):
    flt = _range_filter(start, end)
    if kind in ("unauthorized", "blocked"):
        flt["kind"] = kind
    return _page(get_mongo().access_attempts, flt, page, page_size)


def _audit_filter(q, action, start, end) -> dict:
    flt = _range_filter(start, end)
    if action:
        flt["action"] = {"$regex": "^" + re.escape(action[:40])}
    if q:
        rx = {"$regex": re.escape(q[:60]), "$options": "i"}
        flt["$or"] = [{"actor_email": rx}, {"action": rx}, {"ip": rx}, {"resource_id": rx}, {"details.name": rx}]
    return flt


@router.get("/audit-logs")
def audit_logs(page: int = 1, page_size: int = 25, q: str | None = None, action: str | None = None,
               start: date | None = None, end: date | None = None):
    return _page(get_mongo().audit_logs, _audit_filter(q, action, start, end), page, page_size)


@router.get("/audit-logs/export")
def export_audit(q: str | None = None, action: str | None = None, start: date | None = None, end: date | None = None,
                 admin: User = Depends(get_admin), info: RequestInfo = Depends(get_request_info)):
    cur = get_mongo().audit_logs.find(_audit_filter(q, action, start, end)).sort("ts", -1).limit(10000)
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["timestamp", "action", "actor", "resource_type", "resource_id", "ip", "details"])
    for d in cur:
        w.writerow([d["ts"].isoformat(), d["action"], d.get("actor_email") or "", d.get("resource_type") or "",
                    d.get("resource_id") or "", d.get("ip") or "", json.dumps(d.get("details", {}), default=str)])
    audit.log_audit("admin.audit_export", admin, "audit_logs", None, info)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": 'attachment; filename="trustshare-audit-log.csv"'})


# ------------------------------------------------------------------ users
class AdminUserCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=120)
    password: str
    role: str = Role.USER


class AdminUserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=120)
    role: str | None = None
    is_active: bool | None = None
    storage_quota_bytes: int | None = Field(default=None, ge=0)


@router.get("/users")
def list_users(q: str | None = None, page: int = 1, page_size: int = 25, db: Session = Depends(get_db)):
    page, page_size = max(page, 1), min(max(page_size, 1), 100)
    stmt = select(User)
    if q:
        like = f"%{q[:80]}%"
        stmt = stmt.where(or_(User.email.ilike(like), User.full_name.ilike(like)))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    users = db.scalars(stmt.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    usage = dict(db.execute(select(StoredFile.owner_id, func.coalesce(func.sum(FileVersion.encrypted_size), 0))
                            .join(FileVersion, FileVersion.file_id == StoredFile.id).group_by(StoredFile.owner_id)).all())
    return {"items": [{**user_dict(u), "storage_used": int(usage.get(u.id, 0))} for u in users],
            "total": total, "page": page, "page_size": page_size}


@router.post("/users", status_code=201)
def create_user(body: AdminUserCreate, admin: User = Depends(get_admin), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    if body.role not in Role.ALL:
        raise HTTPException(400, "Unknown role")
    err = validate_password_strength(body.password)
    if err:
        raise HTTPException(400, err)
    if db.scalar(select(User).where(User.email == body.email.lower())):
        raise HTTPException(409, "An account with this email already exists.")
    user = User(email=body.email.lower(), full_name=body.full_name.strip(), role=body.role,
                hashed_password=hash_password(body.password))
    db.add(user)
    db.commit()
    audit.log_audit("admin.user_created", admin, "user", user.id, info, {"email": user.email, "role": user.role})
    return user_dict(user)


@router.patch("/users/{user_id}")
def update_user(user_id: uuid.UUID, body: AdminUserUpdate, admin: User = Depends(get_admin),
                db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id and (body.role not in (None, Role.ADMIN) or body.is_active is False):
        raise HTTPException(400, "You can't remove your own admin access or disable your own account.")
    if body.role is not None:
        if body.role not in Role.ALL:
            raise HTTPException(400, "Unknown role")
        user.role = body.role
    if body.full_name is not None:
        user.full_name = body.full_name.strip()
    if body.storage_quota_bytes is not None:
        user.storage_quota_bytes = body.storage_quota_bytes
    if body.is_active is not None:
        user.is_active = body.is_active
        if not body.is_active:
            session_service.delete_all_sessions(user.id)
    db.commit()
    audit.log_audit("admin.user_updated", admin, "user", user.id, info, body.model_dump(exclude_unset=True), owner_id=user.id)
    return user_dict(user)


@router.post("/users/{user_id}/unlock")
def unlock_user(user_id: uuid.UUID, admin: User = Depends(get_admin), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    get_redis().delete(f"fail:email:{user.email}")
    audit.log_audit("admin.user_unlocked", admin, "user", user.id, info)
    return {"ok": True}


@router.post("/users/{user_id}/reset-mfa")
def reset_mfa(user_id: uuid.UUID, admin: User = Depends(get_admin), db: Session = Depends(get_db),
              info: RequestInfo = Depends(get_request_info)):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    user.mfa_enabled, user.mfa_secret_enc = False, None
    session_service.delete_all_sessions(user.id)
    notification_service.notify(db, user.id, "security", "Two-factor authentication was reset",
                                "An administrator reset your two-factor authentication. Set it up again under Security.",
                                email_to=user.email)
    db.commit()
    audit.log_audit("admin.mfa_reset", admin, "user", user.id, info, owner_id=user.id)
    return user_dict(user)


# ------------------------------------------------------------------ files & sharing
@router.get("/files")
def admin_files(q: str | None = None, page: int = 1, page_size: int = 25, db: Session = Depends(get_db)):
    """File inventory. Admins see metadata only: they cannot download other people's files."""
    page, page_size = max(page, 1), min(max(page_size, 1), 100)
    stmt = select(StoredFile)
    if q:
        stmt = stmt.where(StoredFile.name.ilike(f"%{q[:100]}%"))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.order_by(StoredFile.created_at.desc()).offset((page - 1) * page_size).limit(page_size)).all()
    return {"items": [file_dict(f, "admin", owner_email=f.owner.email if f.owner else None) for f in rows],
            "total": total, "page": page, "page_size": page_size}


@router.delete("/files/{file_id}")
def admin_delete_file(file_id: uuid.UUID, admin: User = Depends(get_admin), db: Session = Depends(get_db),
                      info: RequestInfo = Depends(get_request_info)):
    f = db.get(StoredFile, file_id)
    if not f:
        raise HTTPException(404, "File not found")
    name, owner_id, keys = f.name, f.owner_id, [v.storage_key for v in f.versions]
    db.delete(f)
    notification_service.notify(db, owner_id, "security", "A file was removed by an administrator",
                                f"{name} was permanently deleted by an administrator.")
    db.commit()
    for k in keys:
        storage_service.delete_object(k)
    audit.log_audit("admin.file_deleted", admin, "file", file_id, info, {"name": name}, owner_id=owner_id)
    return {"ok": True}


@router.get("/sharing")
def sharing_report(db: Session = Depends(get_db)):
    now = utcnow()
    total = db.scalar(select(func.count()).select_from(ShareLink)) or 0
    revoked = db.scalar(select(func.count()).select_from(ShareLink).where(ShareLink.revoked_at.is_not(None))) or 0
    expired = db.scalar(select(func.count()).select_from(ShareLink).where(
        ShareLink.revoked_at.is_(None), ShareLink.expires_at <= now)) or 0
    user_shares = db.scalar(select(func.count()).select_from(FileShare).where(FileShare.revoked_at.is_(None))) or 0
    top = db.execute(
        select(StoredFile.name, User.full_name, func.count(ShareLink.id), func.sum(ShareLink.access_count), func.sum(ShareLink.download_count))
        .join(ShareLink, ShareLink.file_id == StoredFile.id).join(User, User.id == StoredFile.owner_id)
        .group_by(StoredFile.id, StoredFile.name, User.full_name).order_by(func.sum(ShareLink.access_count).desc()).limit(5)).all()
    recent = db.scalars(select(ShareLink).order_by(ShareLink.created_at.desc()).limit(10)).all()
    return {
        "totals": {"links": total, "active": total - revoked - expired, "expired": expired, "revoked": revoked,
                   "user_shares": user_shares},
        "top_files": [{"name": n, "owner": o, "links": int(c), "opens": int(a or 0), "downloads": int(d or 0)} for n, o, c, a, d in top],
        "recent_links": [link_dict(l) for l in recent],
    }


# ------------------------------------------------------------------ system monitoring
def _probe(fn) -> dict:
    t = time.perf_counter()
    try:
        fn()
        ok = True
    except Exception:  # noqa: BLE001
        ok = False
    return {"ok": ok, "latency_ms": round((time.perf_counter() - t) * 1000, 1)}


@router.get("/system")
def system(db: Session = Depends(get_db)):
    redis_info = {}
    try:
        info = get_redis().info()
        redis_info = {"used_memory": info.get("used_memory_human"), "clients": info.get("connected_clients")}
    except Exception:  # noqa: BLE001
        pass
    return {
        "services": {
            "postgres": _probe(lambda: db.execute(text("select 1"))),
            "mongodb": _probe(lambda: get_mongo().command("ping")),
            "redis": _probe(lambda: get_redis().ping()),
            "object_storage": {"ok": storage_service.ping(), "latency_ms": None},
        },
        "redis": redis_info,
        "uptime_seconds": int(time.time() - STARTED_AT),
        "key_provider": key_service.get_key_provider().name,
        "totals": {
            "users": db.scalar(select(func.count()).select_from(User)),
            "file_versions": db.scalar(select(func.count()).select_from(FileVersion)),
            "stored_bytes": int(db.scalar(select(func.coalesce(func.sum(FileVersion.encrypted_size), 0))) or 0),
        },
    }


# ------------------------------------------------------------------ key management
@router.get("/keys")
def key_status(db: Session = Depends(get_db)):
    provider = key_service.get_key_provider()
    rows = db.execute(select(FileVersion.kek_version, func.count()).group_by(FileVersion.kek_version)).all()
    outdated = sum(n for v, n in rows if v != provider.active_version)
    return {"provider": provider.name, "active_version": provider.active_version,
            "versions": [{"kek_version": v, "count": n} for v, n in rows], "outdated": outdated}


@router.post("/keys/rotate")
def rotate_keys(admin: User = Depends(get_admin), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    """Re-wrap every data key that is not under the active master key. Encrypted files are untouched."""
    provider = key_service.get_key_provider()
    active = provider.active_version
    rewrapped, failed = 0, []
    while True:
        stmt = select(FileVersion).where(FileVersion.kek_version != active).limit(200)
        if failed:
            stmt = stmt.where(FileVersion.id.not_in(failed))
        batch = db.scalars(stmt).all()
        if not batch:
            break
        for v in batch:
            try:
                ctx = enc.build_aad(v.file_id, v.version).decode()
                v.wrapped_dek, v.kek_version = provider.rewrap(v.wrapped_dek, v.kek_version, ctx)
                rewrapped += 1
            except Exception:  # noqa: BLE001
                failed.append(v.id)
        db.commit()
    audit.log_audit("keys.rotated", admin, "keys", None, info, {"active_version": active, "rewrapped": rewrapped, "failed": len(failed)})
    audit.log_security_event(audit.EVT_OTHER, "info", "Encryption keys rotated", info, admin,
                             f"{rewrapped} data keys re-wrapped under master key {active}", notify_admins=False)
    return {"active_version": active, "rewrapped": rewrapped, "failed": len(failed),
            "note": "Add the new master key to MASTER_KEYS and set ACTIVE_KEY_VERSION before rotating; keep old keys until this reports 0 outdated."}
