"""Background task (every 5 minutes): remind owners about expiring share links + empty old trash."""
import asyncio
import logging
from datetime import timedelta

from sqlalchemy import select

from app.db.postgres import SessionLocal
from app.models.postgres import SharedLink, StoredFile, User, utcnow
from app.db.redis import redis_client
from app.services.audit import log_event
from app.services.notifications import notify_user
from app.services.trash import purge_expired_trash

logger = logging.getLogger("trustshare.reminders")


async def check_expiring_links() -> int:
    sent = 0
    async with SessionLocal() as db:
        soon = utcnow() + timedelta(hours=24)
        rows = await db.execute(
            select(SharedLink, StoredFile.original_name, User)
            .join(StoredFile, StoredFile.id == SharedLink.file_id)
            .join(User, User.id == SharedLink.created_by)
            .where(SharedLink.reminder_sent.is_(False), SharedLink.revoked.is_(False),
                   SharedLink.expires_at > utcnow(), SharedLink.expires_at <= soon)
        )
        for link, file_name, owner in rows.all():
            await notify_user(owner.id, owner.email, "Share link expiring soon",
                              f"Your share link for '{file_name}' expires within 24 hours.", send_mail=True,
                              ntype="link_expiring", link="/shared-by-me")
            link.reminder_sent = True
            sent += 1
        await db.commit()
    return sent


async def log_expired_links() -> int:
    """Milestone 3 / Task 1: record "sharing link expired" in the activity log once per link, and tell the owner."""
    done = 0
    async with SessionLocal() as db:
        rows = await db.execute(
            select(SharedLink, StoredFile.original_name, User)
            .join(StoredFile, StoredFile.id == SharedLink.file_id).join(User, User.id == SharedLink.created_by)
            .where(SharedLink.revoked.is_(False), SharedLink.expires_at <= utcnow(),
                   SharedLink.expires_at >= utcnow() - timedelta(days=30)).limit(200))
        for link, file_name, owner in rows.all():
            if await redis_client.set(f"linkexpired:{link.id}", "1", ex=90 * 86400, nx=True):   # only the first time
                await log_event("share_link_expire", user_id=owner.id, user_email=owner.email, owner_id=owner.id, resource_type="file",
                                resource_id=link.file_id, details={"link_id": link.id, "name": file_name})
                await notify_user(owner.id, owner.email, "Share link expired", f"Your share link for '{file_name}' has expired and no longer works.",
                                  ntype="link_expiring", link="/shared-by-me")
                done += 1
    return done


async def reminder_loop(interval_seconds: int = 300) -> None:
    while True:
        try:
            await check_expiring_links()
            await log_expired_links()
            await purge_expired_trash()
        except Exception as exc:
            logger.warning("Background check failed: %s", type(exc).__name__)
        await asyncio.sleep(interval_seconds)
