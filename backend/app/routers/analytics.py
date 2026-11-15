"""Analytics + audit-log viewer + security alerts."""
import re
from datetime import datetime, timedelta, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, is_admin, require_roles
from app.core.validation import category_for_mime
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import SharedLink, StoredFile, User, utcnow

router = APIRouter(prefix="/analytics", tags=["Analytics"])


def _clean(doc: dict) -> dict:
    doc["id"] = str(doc.pop("_id"))
    for k, v in list(doc.items()):
        if isinstance(v, datetime):
            doc[k] = v.replace(tzinfo=timezone.utc).isoformat() if v.tzinfo is None else v.isoformat()
    return doc


def _scope_filter(user: User) -> dict:
    """Admins see everything. Normal users only see events they did or events on their own files."""
    if is_admin(user):
        return {}
    return {"$or": [{"user_id": user.id}, {"owner_id": user.id}]}


@router.get("/storage")
async def storage(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    q = select(StoredFile.mime_type, func.count(), func.coalesce(func.sum(StoredFile.size_bytes), 0))
    if not is_admin(user):
        q = q.where(StoredFile.owner_id == user.id)
    rows = (await db.execute(q.group_by(StoredFile.mime_type))).all()
    by_cat: dict[str, dict] = {}
    for mime, count, size in rows:
        cat = category_for_mime(mime)
        item = by_cat.setdefault(cat, {"category": cat, "files": 0, "bytes": 0})
        item["files"] += count
        item["bytes"] += int(size)
    used = sum(c["bytes"] for c in by_cat.values())
    return {
        "used_bytes": used,
        "file_count": sum(c["files"] for c in by_cat.values()),
        "quota_bytes": settings.quota_bytes if not is_admin(user) else None,
        "by_category": sorted(by_cat.values(), key=lambda c: -c["bytes"]),
    }


@router.get("/largest")
async def largest_files(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """The 8 biggest files (for the Storage page). Admins see the whole platform."""
    q = select(StoredFile, User.email).join(User, User.id == StoredFile.owner_id).where(StoredFile.deleted_at.is_(None))
    if not is_admin(user):
        q = q.where(StoredFile.owner_id == user.id)
    rows = (await db.execute(q.order_by(StoredFile.size_bytes.desc()).limit(8))).all()
    return [{"id": f.id, "name": f.original_name, "size_bytes": f.size_bytes, "category": category_for_mime(f.mime_type),
             "owner_email": email, "created_at": f.created_at.isoformat()} for f, email in rows]


@router.get("/activity")
async def activity(days: int = Query(14, ge=1, le=90), user: User = Depends(get_current_user)):
    """Uploads and downloads per day (for the line chart)."""
    since = datetime.now(timezone.utc) - timedelta(days=days - 1)
    since = since.replace(hour=0, minute=0, second=0, microsecond=0)
    match = {"timestamp": {"$gte": since}, "result": "success",
             "action": {"$in": ["upload", "download", "share_download"]}, **_scope_filter(user)}
    pipeline = [
        {"$match": match},
        {"$group": {"_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                            "action": "$action"}, "count": {"$sum": 1}}},
    ]
    counts: dict[str, dict[str, int]] = {}
    async for row in mongo_db.audit_logs.aggregate(pipeline):
        day, action = row["_id"]["day"], row["_id"]["action"]
        bucket = counts.setdefault(day, {"uploads": 0, "downloads": 0})
        bucket["uploads" if action == "upload" else "downloads"] += row["count"]
    series = []
    for i in range(days):
        day = (since + timedelta(days=i)).strftime("%Y-%m-%d")
        series.append({"day": day, **counts.get(day, {"uploads": 0, "downloads": 0})})
    return series


@router.get("/summary")
async def summary(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(hours=24)
    base = {"timestamp": {"$gte": since}, **_scope_filter(user)}
    events = await mongo_db.audit_logs.count_documents(base)
    failed_logins = await mongo_db.audit_logs.count_documents({**base, "action": "login", "result": "failure"}) \
        if is_admin(user) else 0
    denied = await mongo_db.audit_logs.count_documents({**base, "result": "failure"})
    open_alerts = await mongo_db.security_alerts.count_documents({"resolved": False}) if is_admin(user) else 0
    pending_approvals = (await db.execute(select(func.count()).select_from(User).where(User.approval_status == "pending"))).scalar() if is_admin(user) else 0
    links_q = select(func.count()).select_from(SharedLink).where(SharedLink.revoked.is_(False),
                                                                 SharedLink.expires_at > utcnow())
    if not is_admin(user):
        links_q = links_q.where(SharedLink.created_by == user.id)
    active_links = (await db.execute(links_q)).scalar()
    return {"events_24h": events, "failed_logins_24h": failed_logins, "failed_actions_24h": denied,
            "open_alerts": open_alerts, "pending_approvals": pending_approvals, "active_links": active_links}


@router.get("/audit")
async def audit_logs(
    q: str | None = None,
    action: str | None = None,
    severity: str | None = None,
    result: str | None = None,
    user_email: str | None = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
):
    clauses: list[dict] = []
    scope = _scope_filter(user)
    if scope:
        clauses.append(scope)
    if action:
        clauses.append({"action": action})
    if severity:
        clauses.append({"severity": severity})
    if result:
        clauses.append({"result": result})
    if user_email and is_admin(user):
        clauses.append({"user_email": {"$regex": re.escape(user_email), "$options": "i"}})
    if q:
        rx = {"$regex": re.escape(q), "$options": "i"}
        clauses.append({"$or": [{"user_email": rx}, {"action": rx}, {"ip": rx}, {"details.name": rx},
                                {"details.reason": rx}]})
    query = {"$and": clauses} if clauses else {}
    total = await mongo_db.audit_logs.count_documents(query)
    cursor = mongo_db.audit_logs.find(query).sort("timestamp", -1).skip((page - 1) * page_size).limit(page_size)
    items = [_clean(d) async for d in cursor]
    return {"items": items, "total": total, "page": page, "page_size": page_size}


@router.get("/alerts")
async def alerts(resolved: bool | None = None, _: User = Depends(require_roles("admin"))):
    query = {} if resolved is None else {"resolved": resolved}
    return [_clean(d) async for d in mongo_db.security_alerts.find(query).sort("created_at", -1).limit(100)]


@router.patch("/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: str, _: User = Depends(require_roles("admin"))):
    try:
        oid = ObjectId(alert_id)
    except Exception:
        raise HTTPException(400, "Invalid alert id")
    res = await mongo_db.security_alerts.update_one({"_id": oid}, {"$set": {"resolved": True}})
    if res.matched_count == 0:
        raise HTTPException(404, "Alert not found")
    return {"message": "Alert resolved"}
