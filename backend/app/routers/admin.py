"""Admin only: platform overview, user monitoring, security analytics, storage and key rotation."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.version import APP_VERSION
from app.core.crypto import get_key_manager
from app.core.deps import require_roles
from app.core.validation import category_for_mime
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.db.redis import redis_client
from app.models.postgres import FilePermission, Role, SharedLink, StoredFile, User, UserRole, utcnow
from app.schemas.auth import UserOut, user_to_out
from app.services.audit import log_event

router = APIRouter(prefix="/admin", tags=["Admin"])


class RoleIn(BaseModel):
    role: str


class ActiveIn(BaseModel):
    is_active: bool


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


async def _storage_by_user(db: AsyncSession) -> dict:
    rows = (await db.execute(
        select(StoredFile.owner_id, func.count(), func.coalesce(func.sum(StoredFile.size_bytes), 0))
        .group_by(StoredFile.owner_id))).all()
    return {r[0]: {"files": r[1], "bytes": int(r[2])} for r in rows}


async def _login_info() -> dict:
    """Last successful login (time + IP) per user, taken from the audit log."""
    pipeline = [
        {"$match": {"action": "login", "result": "success", "user_id": {"$ne": None}}},
        {"$sort": {"timestamp": 1}},
        {"$group": {"_id": "$user_id", "last_login": {"$last": "$timestamp"}, "last_ip": {"$last": "$ip"},
                    "logins": {"$sum": 1}}},
    ]
    return {d["_id"]: d async for d in mongo_db.audit_logs.aggregate(pipeline)}


async def _active_sessions() -> int:
    """Each logged-in session has one refresh token stored in Redis."""
    count = 0
    async for _ in redis_client.scan_iter(match="refresh:*", count=200):
        count += 1
    return count


# ------------------------------------------------------------------ overview
@router.get("/overview")
async def overview(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    now = utcnow()
    total_users = (await db.execute(select(func.count()).select_from(User))).scalar()
    active_users = (await db.execute(select(func.count()).select_from(User).where(User.is_active.is_(True)))).scalar()
    mfa_users = (await db.execute(select(func.count()).select_from(User).where(User.mfa_enabled.is_(True)))).scalar()
    new_7d = (await db.execute(select(func.count()).select_from(User)
                               .where(User.created_at >= now - timedelta(days=7)))).scalar()
    role_rows = (await db.execute(select(Role.name, func.count()).join(UserRole, UserRole.role_id == Role.id)
                                  .group_by(Role.name))).all()
    roles = {n: c for n, c in role_rows}

    cat_rows = (await db.execute(select(StoredFile.mime_type, func.count(),
                                        func.coalesce(func.sum(StoredFile.size_bytes), 0))
                                 .group_by(StoredFile.mime_type))).all()
    by_cat: dict[str, dict] = {}
    for mime, count, size in cat_rows:
        item = by_cat.setdefault(category_for_mime(mime), {"category": category_for_mime(mime), "files": 0, "bytes": 0})
        item["files"] += count
        item["bytes"] += int(size)
    used = sum(c["bytes"] for c in by_cat.values())
    capacity = settings.platform_capacity_bytes

    usage = await _storage_by_user(db)
    users = {u.id: u for u in (await db.execute(select(User))).scalars().all()}
    top = sorted(usage.items(), key=lambda kv: -kv[1]["bytes"])[:5]
    top_users = [{"user_id": uid, "name": users[uid].full_name if uid in users else "?",
                  "email": users[uid].email if uid in users else "?", **info} for uid, info in top]

    day = now - timedelta(hours=24)
    audit = mongo_db.audit_logs
    events_24h = await audit.count_documents({"timestamp": {"$gte": day}})
    failed_logins_24h = await audit.count_documents({"timestamp": {"$gte": day}, "action": "login", "result": "failure"})
    uploads_24h = await audit.count_documents({"timestamp": {"$gte": day}, "action": "upload", "result": "success"})
    downloads_24h = await audit.count_documents({"timestamp": {"$gte": day},
                                                 "action": {"$in": ["download", "share_download"]}, "result": "success"})
    open_alerts = await mongo_db.security_alerts.count_documents({"resolved": False})
    active_links = (await db.execute(select(func.count()).select_from(SharedLink)
                                     .where(SharedLink.revoked.is_(False), SharedLink.expires_at > now))).scalar()

    return {
        "users": {"total": total_users, "active": active_users, "disabled": total_users - active_users,
                  "new_7d": new_7d, "mfa_enabled": mfa_users, "roles": roles},
        "storage": {"used_bytes": used, "capacity_bytes": capacity, "free_bytes": max(capacity - used, 0),
                    "file_count": sum(c["files"] for c in by_cat.values()),
                    "by_category": sorted(by_cat.values(), key=lambda c: -c["bytes"]), "top_users": top_users,
                    "per_user_quota_bytes": settings.quota_bytes},
        "activity_24h": {"events": events_24h, "failed_logins": failed_logins_24h, "uploads": uploads_24h,
                         "downloads": downloads_24h},
        "active_sessions": await _active_sessions(),
        "open_alerts": open_alerts,
        "active_links": active_links,
    }


# ------------------------------------------------------------------ security analytics
@router.get("/security")
async def security(days: int = Query(14, ge=1, le=60), _: User = Depends(require_roles("admin"))):
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    audit = mongo_db.audit_logs

    # logins per day (success vs failure)
    series: dict[str, dict] = {}
    pipeline = [
        {"$match": {"timestamp": {"$gte": since}, "action": "login"}},
        {"$group": {"_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "result": "$result"}, "count": {"$sum": 1}}},
    ]
    async for r in audit.aggregate(pipeline):
        b = series.setdefault(r["_id"]["day"], {"success": 0, "failure": 0})
        b[r["_id"]["result"]] = r["count"]
    login_series = []
    for i in range(days):
        d = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        login_series.append({"day": d, **series.get(d, {"success": 0, "failure": 0})})

    # events by severity
    sev = {"info": 0, "warning": 0, "critical": 0}
    async for r in audit.aggregate([{"$match": {"timestamp": {"$gte": since}}},
                                    {"$group": {"_id": "$severity", "count": {"$sum": 1}}}]):
        sev[r["_id"]] = r["count"]

    # alerts by type
    alerts_by_type = [{"type": r["_id"], "count": r["count"]} async for r in mongo_db.security_alerts.aggregate(
        [{"$match": {"created_at": {"$gte": since}}}, {"$group": {"_id": "$type", "count": {"$sum": 1}}},
         {"$sort": {"count": -1}}])]

    # IP addresses with the most failures
    top_ips = [{"ip": r["_id"], "failures": r["count"], "last_seen": _iso(r["last"])}
               async for r in audit.aggregate([
                   {"$match": {"timestamp": {"$gte": since}, "result": "failure", "ip": {"$ne": None}}},
                   {"$group": {"_id": "$ip", "count": {"$sum": 1}, "last": {"$max": "$timestamp"}}},
                   {"$sort": {"count": -1}}, {"$limit": 8}])]

    # failures by action
    failed_by_action = [{"action": r["_id"], "count": r["count"]} async for r in audit.aggregate([
        {"$match": {"timestamp": {"$gte": since}, "result": "failure"}},
        {"$group": {"_id": "$action", "count": {"$sum": 1}}}, {"$sort": {"count": -1}}, {"$limit": 8}])]

    recent = []
    async for d in audit.find({"severity": {"$in": ["warning", "critical"]}}).sort("timestamp", -1).limit(10):
        recent.append({"id": str(d["_id"]), "action": d["action"], "user_email": d.get("user_email"),
                       "ip": d.get("ip"), "severity": d["severity"], "result": d["result"],
                       "reason": (d.get("details") or {}).get("reason"), "timestamp": _iso(d["timestamp"])})

    return {"login_series": login_series, "severity": sev, "alerts_by_type": alerts_by_type,
            "top_failing_ips": top_ips, "failed_by_action": failed_by_action, "recent_events": recent,
            "totals": {"logins_ok": sum(s["success"] for s in login_series),
                       "logins_failed": sum(s["failure"] for s in login_series)}}


# ------------------------------------------------------------------ user monitoring
@router.get("/users")
async def list_users(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    users = (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all()
    usage = await _storage_by_user(db)
    logins = await _login_info()
    out = []
    for u in users:
        info = usage.get(u.id, {"files": 0, "bytes": 0})
        li = logins.get(u.id)
        out.append({**user_to_out(u).model_dump(mode="json"), "files": info["files"], "storage_bytes": info["bytes"],
                    "quota_bytes": settings.quota_bytes, "last_login": _iso(li["last_login"]) if li else None,
                    "last_ip": li["last_ip"] if li else None, "login_count": li["logins"] if li else 0})
    return out


@router.get("/users/{user_id}/activity")
async def user_activity(user_id: str, _: User = Depends(require_roles("admin"))):
    items = []
    async for d in mongo_db.audit_logs.find({"user_id": user_id}).sort("timestamp", -1).limit(25):
        items.append({"id": str(d["_id"]), "action": d["action"], "result": d["result"], "severity": d["severity"],
                      "ip": d.get("ip"), "name": (d.get("details") or {}).get("name"),
                      "reason": (d.get("details") or {}).get("reason"), "timestamp": _iso(d["timestamp"])})
    return items


@router.patch("/users/{user_id}/role", response_model=UserOut)
async def change_role(user_id: str, body: RoleIn, request: Request, admin: User = Depends(require_roles("admin")),
                      db: AsyncSession = Depends(get_db)):
    if body.role not in ("admin", "user", "guest"):
        raise HTTPException(400, "Role must be admin, user or guest")
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot change your own role")
    role = (await db.execute(select(Role).where(Role.name == body.role))).scalar_one()
    user.roles = [role]
    await db.commit()
    await log_event("role_change", request, user=admin, resource_type="user", resource_id=user.id,
                    severity="warning", details={"new_role": body.role, "target": user.email})
    return user_to_out(user)


@router.patch("/users/{user_id}/active", response_model=UserOut)
async def set_active(user_id: str, body: ActiveIn, request: Request, admin: User = Depends(require_roles("admin")),
                     db: AsyncSession = Depends(get_db)):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id:
        raise HTTPException(400, "You cannot disable your own account")
    user.is_active = body.is_active
    await db.commit()
    await log_event("user_active_change", request, user=admin, resource_type="user", resource_id=user.id,
                    severity="warning", details={"is_active": body.is_active, "target": user.email})
    return user_to_out(user)


# ------------------------------------------------------------------ encryption keys
@router.get("/keys/status")
async def key_status(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(select(StoredFile.kek_version, func.count()).group_by(StoredFile.kek_version))).all()
    return {"current_version": get_key_manager().current, "files_by_key_version": {v: c for v, c in rows}}


@router.post("/keys/rotate")
async def rotate_keys(request: Request, admin: User = Depends(require_roles("admin")),
                      db: AsyncSession = Depends(get_db)):
    """Re-wrap every file's DEK with the CURRENT master key. Encrypted files themselves are not touched."""
    km = get_key_manager()
    files = (await db.execute(select(StoredFile).where(StoredFile.kek_version != km.current))).scalars().all()
    for f in files:
        f.wrapped_dek, f.kek_version = km.rewrap_dek(f.wrapped_dek, f.kek_version, f.id)
    await db.commit()
    await log_event("key_rotation", request, user=admin, severity="warning",
                    details={"rewrapped": len(files), "to_version": km.current})
    return {"rewrapped": len(files), "current_version": km.current}


# ====================================================================== File Management / Sharing Reports / System Monitoring
@router.get("/files")
async def all_files(q: str | None = None, status: str = "active", _: User = Depends(require_roles("admin")),
                    db: AsyncSession = Depends(get_db)):
    """File Management: metadata of every file on the platform (never the content or the keys)."""
    query = select(StoredFile, User.email, User.full_name).join(User, User.id == StoredFile.owner_id)
    query = query.where(StoredFile.deleted_at.is_not(None) if status == "trash" else StoredFile.deleted_at.is_(None))
    if q:
        query = query.where(StoredFile.original_name.ilike(f"%{q}%"))
    rows = (await db.execute(query.order_by(StoredFile.created_at.desc()).limit(300))).all()
    from app.services.tripwire import tripwire_ids

    traps = await tripwire_ids()
    return [{"id": f.id, "name": f.original_name, "size_bytes": f.size_bytes, "category": category_for_mime(f.mime_type),
             "owner_email": email, "owner_name": name, "kek_version": f.kek_version, "created_at": _iso(f.created_at),
             "deleted_at": _iso(f.deleted_at), "tripwire": f.id in traps} for f, email, name in rows]


@router.get("/shares")
async def all_shares(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """Sharing Reports: every share link on the platform with its current status."""
    from app.routers.share import link_status

    rows = (await db.execute(
        select(SharedLink, StoredFile.original_name, StoredFile.deleted_at, User.email)
        .join(StoredFile, StoredFile.id == SharedLink.file_id).join(User, User.id == SharedLink.created_by)
        .order_by(SharedLink.created_at.desc()).limit(300))).all()
    links = []
    counts = {"active": 0, "expired": 0, "revoked": 0, "exhausted": 0, "unavailable": 0}
    for link, name, deleted, creator in rows:
        status = link_status(link)
        if deleted is not None and status == "active":
            status = "unavailable"
        counts[status] = counts.get(status, 0) + 1
        links.append({"id": link.id, "file_name": name, "created_by": creator, "status": status, "expires_at": _iso(link.expires_at),
                      "download_count": link.download_count, "max_downloads": link.max_downloads, "allow_download": link.allow_download,
                      "has_password": bool(link.password_hash), "created_at": _iso(link.created_at)})
    permissions = (await db.execute(select(func.count()).select_from(FilePermission))).scalar()
    return {"counts": counts, "total_links": len(links), "people_permissions": permissions, "links": links}


_STARTED = datetime.now(timezone.utc)


@router.get("/system")
async def system_health(_: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """System Monitoring: is every part of the platform alive, and how fast does it answer?"""
    import asyncio
    import time

    from sqlalchemy import text

    from app.core.storage import get_storage

    async def timed(name: str, coro) -> dict:
        t = time.perf_counter()
        try:
            await coro
            return {"name": name, "ok": True, "ms": round((time.perf_counter() - t) * 1000, 1)}
        except Exception as exc:  # report the problem instead of crashing the page
            return {"name": name, "ok": False, "ms": None, "error": type(exc).__name__}

    async def check_storage():
        storage = get_storage()
        if settings.STORAGE_BACKEND == "s3":
            await asyncio.to_thread(storage.client.head_bucket, Bucket=storage.bucket)
        else:
            import os
            if not os.access(settings.LOCAL_STORAGE_PATH, os.W_OK):
                raise OSError("storage folder not writable")

    services = [
        await timed("PostgreSQL (metadata)", db.execute(text("SELECT 1"))),
        await timed("MongoDB (audit logs)", mongo_db.command("ping")),
        await timed("Redis (sessions, rate limits)", redis_client.ping()),
        await timed(f"File storage ({settings.STORAGE_BACKEND})", check_storage()),
    ]
    counts = {
        "users": (await db.execute(select(func.count()).select_from(User))).scalar(),
        "files": (await db.execute(select(func.count()).select_from(StoredFile).where(StoredFile.deleted_at.is_(None)))).scalar(),
        "links": (await db.execute(select(func.count()).select_from(SharedLink))).scalar(),
        "audit_records": await mongo_db.audit_logs.estimated_document_count(),
        "open_alerts": await mongo_db.security_alerts.count_documents({"resolved": False}),
    }
    return {"services": services, "counts": counts, "environment": settings.ENVIRONMENT, "version": APP_VERSION,
            "started_at": _iso(_STARTED), "uptime_seconds": int((datetime.now(timezone.utc) - _STARTED).total_seconds()),
            "key_version": get_key_manager().current}
