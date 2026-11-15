"""Notification Management for administrators (Milestone 3, final integration): statistics, e-mail delivery log,
broadcast announcements and an SMTP test. Admin only."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import require_roles
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.mongo import now
from app.models.postgres import Role, User, UserRole
from app.services.audit import log_event
from app.services.notifications import NOTIFICATION_TYPES, send_email

router = APIRouter(prefix="/admin/notifications", tags=["Notification management"])


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return (dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt).isoformat()


@router.get("/overview")
async def overview(days: int = 7, _: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    since = datetime.now(timezone.utc) - timedelta(days=max(1, min(days, 90)))
    win = {"created_at": {"$gte": since}}
    by_type = {r["_id"] or "system": r["n"] async for r in mongo_db.notifications.aggregate(
        [{"$match": win}, {"$group": {"_id": "$type", "n": {"$sum": 1}}}])}
    per_day: dict[str, int] = {}
    async for r in mongo_db.notifications.aggregate([{"$match": win}, {"$group": {"_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at"}}, "n": {"$sum": 1}}}]):
        per_day[r["_id"]] = r["n"]
    series = [{"day": (since + timedelta(days=i + 1)).strftime("%Y-%m-%d"), "count": 0} for i in range(max(1, min(days, 90)))]
    for row in series:
        row["count"] = per_day.get(row["day"], 0)
    emails = {r["_id"]: r["n"] async for r in mongo_db.email_log.aggregate([{"$match": win}, {"$group": {"_id": "$status", "n": {"$sum": 1}}}])}
    total = await mongo_db.notifications.count_documents(win)
    unread = await mongo_db.notifications.count_documents({**win, "read": False})

    recent = [d async for d in mongo_db.notifications.find({}).sort("created_at", -1).limit(25)]
    users = {}
    ids = {d["user_id"] for d in recent}
    if ids:
        users = {uid: (name, email) for uid, name, email in (await db.execute(select(User.id, User.full_name, User.email).where(User.id.in_(ids)))).all()}
    email_log = [{"id": str(d["_id"]), "to": d["to"], "subject": d["subject"], "status": d["status"], "error": d.get("error"), "kind": d.get("kind"),
                  "created_at": _iso(d["created_at"])} async for d in mongo_db.email_log.find({}).sort("created_at", -1).limit(15)]
    return {
        "range_days": days, "total": total, "unread": unread, "read_rate": round((total - unread) / total * 100) if total else None,
        "by_type": by_type, "series": series, "emails": {"sent": emails.get("sent", 0), "failed": emails.get("failed", 0), "skipped": emails.get("skipped", 0)},
        "smtp_configured": bool(settings.SMTP_HOST), "admin_email": settings.ADMIN_EMAIL or None,
        "recent": [{"id": str(d["_id"]), "title": d["title"], "message": d["message"], "type": d.get("type", "system"), "read": d["read"],
                    "email_status": d.get("email_status"), "to_name": users.get(d["user_id"], ("?", "?"))[0],
                    "to_email": users.get(d["user_id"], ("?", "?"))[1], "created_at": _iso(d["created_at"])} for d in recent],
        "email_log": email_log, "types": NOTIFICATION_TYPES,
    }


class BroadcastIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    message: str = Field(min_length=3, max_length=1000)
    audience: str = Field(default="all", pattern="^(all|admins|users)$")
    send_email: bool = False


@router.post("/broadcast")
async def broadcast(body: BroadcastIn, request: Request, admin: User = Depends(require_roles("admin")), db: AsyncSession = Depends(get_db)):
    """Send an announcement to everyone, only admins, or only normal users (in-app, and optionally by e-mail)."""
    q = select(User.id, User.email).where(User.is_active.is_(True))
    if body.audience in ("admins", "users"):
        admin_ids = select(UserRole.user_id).join(Role, Role.id == UserRole.role_id).where(Role.name == "admin")
        q = q.where(User.id.in_(admin_ids)) if body.audience == "admins" else q.where(User.id.not_in(admin_ids))
    people = (await db.execute(q)).all()
    if not people:
        raise HTTPException(400, "Nobody matches that audience")
    docs = [{"user_id": uid, "title": body.title, "message": body.message, "type": "announcement", "link": None, "read": False,
             "email_status": None, "created_at": now()} for uid, _ in people]
    await mongo_db.notifications.insert_many(docs)
    mailed = 0
    if body.send_email:
        for _, email in people[:200]:                    # simplified: at most 200 e-mails per broadcast
            if await send_email(email, body.title, body.message, kind="announcement") == "sent":
                mailed += 1
    await log_event("notification_broadcast", request, user=admin, details={"title": body.title, "audience": body.audience, "recipients": len(people), "emails_sent": mailed})
    return {"recipients": len(people), "emails_sent": mailed, "smtp_configured": bool(settings.SMTP_HOST)}


class TestMailIn(BaseModel):
    to: str = Field(max_length=200)


@router.post("/test-email")
async def test_email(body: TestMailIn, admin: User = Depends(require_roles("admin"))):
    """Sends one e-mail so you can prove the e-mail integration works (status is also written to the e-mail log)."""
    status = await send_email(body.to, "TrustShare test e-mail", f"This is a test e-mail sent by {admin.email} from the TrustShare admin panel.", kind="test")
    return {"status": status, "smtp_configured": bool(settings.SMTP_HOST)}
