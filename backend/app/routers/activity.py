"""Activity monitoring (Milestone 3, Task 1): who did what, per user and for the whole platform. Admin only.

Every activity is stored by log_event() in MongoDB `audit_logs` with: activity id (_id), user id, activity type (action),
file id (resource_id), status (result), IP address and timestamp. These endpoints turn that raw stream into
"User Activity Monitoring" screens.
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import require_roles, role_names
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.postgres import User
from app.services.audit_view import to_rows

router = APIRouter(prefix="/activity", tags=["Activity monitoring (admin)"])

# which action names belong to which column of the user table
UPLOAD = ["upload"]
DOWNLOAD = ["download", "share_download"]
SHARE = ["permission_grant", "share_link_create"]


def _cond(actions: list[str], result: str = "success") -> dict:
    return {"$sum": {"$cond": [{"$and": [{"$in": ["$action", actions]}, {"$eq": ["$result", result]}]}, 1, 0]}}


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


@router.get("/users")
async def users_activity(days: int = Query(30, ge=1, le=365), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """One row per user: logins, failed logins, uploads, downloads, shares, denied actions, last login and last activity."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    audit = mongo_db.audit_logs
    stats = {r["_id"]: r async for r in audit.aggregate([
        {"$match": {"timestamp": {"$gte": since}, "user_id": {"$ne": None}}},
        {"$group": {"_id": "$user_id", "last": {"$max": "$timestamp"}, "events": {"$sum": 1},
                    "logins": _cond(["login"]), "failed_logins": _cond(["login"], "failure"), "uploads": _cond(UPLOAD),
                    "downloads": _cond(DOWNLOAD), "shares": _cond(SHARE), "denied": {"$sum": {"$cond": [{"$eq": ["$result", "failure"]}, 1, 0]}}}}])}
    last_login = {r["_id"]: r async for r in audit.aggregate([
        {"$match": {"action": "login", "result": "success", "user_id": {"$ne": None}}}, {"$sort": {"timestamp": -1}},
        {"$group": {"_id": "$user_id", "at": {"$first": "$timestamp"}, "ip": {"$first": "$ip"}, "location": {"$first": "$location"}}}])}
    now = datetime.now(timezone.utc)
    out = []
    for u in (await db.execute(select(User).order_by(User.created_at.desc()))).scalars().all():
        s = stats.get(u.id, {})
        last = s.get("last")
        last_aware = (last.replace(tzinfo=timezone.utc) if last and last.tzinfo is None else last)
        ll = last_login.get(u.id, {})
        out.append({"user_id": u.id, "name": u.full_name, "email": u.email, "roles": role_names(u), "active": u.is_active,
                    "events": s.get("events", 0), "logins": s.get("logins", 0), "failed_logins": s.get("failed_logins", 0),
                    "uploads": s.get("uploads", 0), "downloads": s.get("downloads", 0), "shares": s.get("shares", 0), "denied": s.get("denied", 0),
                    "last_activity": _iso(last), "last_login": _iso(ll.get("at")), "last_ip": ll.get("ip"), "last_location": ll.get("location"),
                    "online": bool(last_aware and now - last_aware < timedelta(minutes=10)),
                    "risk": "high" if s.get("denied", 0) >= 10 else "medium" if s.get("denied", 0) >= 3 else "low"})
    out.sort(key=lambda r: (not r["online"], -(r["events"])))
    return {"days": days, "users": out, "totals": {k: sum(r[k] for r in out) for k in ("events", "logins", "failed_logins", "uploads", "downloads", "shares", "denied")},
            "online_now": sum(1 for r in out if r["online"])}


@router.get("/users/{user_id}")
async def user_timeline(user_id: str, days: int = Query(30, ge=1, le=365), _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """One user's history: login, upload, download and sharing activity, newest first, plus a small chart."""
    u = await db.get(User, user_id)
    if not u:
        raise HTTPException(404, "User not found")
    since = datetime.now(timezone.utc) - timedelta(days=days)
    flt = {"user_id": user_id, "timestamp": {"$gte": since}}
    docs = [d async for d in mongo_db.audit_logs.find(flt).sort("timestamp", -1).limit(150)]
    per_day: dict[str, dict] = {}
    async for r in mongo_db.audit_logs.aggregate([{"$match": flt}, {"$group": {
            "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}}, "logins": _cond(["login"]), "uploads": _cond(UPLOAD),
            "downloads": _cond(DOWNLOAD), "shares": _cond(SHARE), "denied": {"$sum": {"$cond": [{"$eq": ["$result", "failure"]}, 1, 0]}}}}, {"$sort": {"_id": 1}}]):
        per_day[r["_id"]] = {"day": r["_id"], **{k: r[k] for k in ("logins", "uploads", "downloads", "shares", "denied")}}
    return {"user": {"id": u.id, "name": u.full_name, "email": u.email, "roles": role_names(u), "active": u.is_active},
            "series": list(per_day.values()), "rows": await to_rows(db, docs)}
