"""Background jobs: expiration reminders, link-expiry audit records, and trash purge."""
import logging
from datetime import timedelta

from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy import select

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.redis_client import get_redis
from app.models import FileShare, ShareLink, StoredFile, aware, utcnow
from app.services import audit_service, notification_service, storage_service

log = logging.getLogger("trustshare.jobs")
scheduler = BackgroundScheduler(timezone="UTC")


def expiry_reminders() -> None:
    """Remind owners about links/shares that expire within 24h (only ones that lived longer than a day)."""
    now = utcnow()
    soon = now + timedelta(hours=24)
    with SessionLocal() as db:
        for link in db.scalars(select(ShareLink).where(
                ShareLink.revoked_at.is_(None), ShareLink.reminder_sent.is_(False),
                ShareLink.expires_at > now, ShareLink.expires_at <= soon)):
            link.reminder_sent = True
            if aware(link.expires_at) - aware(link.created_at) > timedelta(hours=24):
                notification_service.notify(
                    db, link.created_by, "expiry", "Share link expires soon",
                    f"The link to {link.file.name} expires on {aware(link.expires_at):%d %b %Y, %H:%M} UTC.",
                    link="/app/shared-by-me", email_to=link.creator.email)
        for share in db.scalars(select(FileShare).where(
                FileShare.revoked_at.is_(None), FileShare.reminder_sent.is_(False), FileShare.expires_at.is_not(None),
                FileShare.expires_at > now, FileShare.expires_at <= soon)):
            share.reminder_sent = True
            if aware(share.expires_at) - aware(share.created_at) > timedelta(hours=24):
                notification_service.notify(
                    db, share.shared_by, "expiry", "Shared access expires soon",
                    f"{share.recipient.full_name}'s access to {share.file.name} ends on {aware(share.expires_at):%d %b %Y, %H:%M} UTC.",
                    link="/app/shared-by-me")
        db.commit()


def record_expired_links() -> None:
    """Write an audit record (and tell the owner) the first time we see a link past its expiry."""
    now = utcnow()
    r = get_redis()
    key = "audit:expired_links_logged"
    with SessionLocal() as db:
        recent = db.scalars(select(ShareLink).where(
            ShareLink.revoked_at.is_(None), ShareLink.expires_at <= now,
            ShareLink.expires_at > now - timedelta(days=3))).all()
        for link in recent:
            if r.sadd(key, str(link.id)):
                audit_service.log_audit(
                    "share.link_expired", None, "file", link.file_id, None,
                    {"name": link.file.name if link.file else None, "link_id": str(link.id)}, owner_id=link.created_by)
                notification_service.notify(
                    db, link.created_by, "expiry", "Share link expired",
                    f"The link to {link.file.name if link.file else 'your file'} has expired and no longer works.",
                    link="/app/shared-by-me")
        r.expire(key, 30 * 86400)
        db.commit()


def purge_trash() -> None:
    cutoff = utcnow() - timedelta(days=settings.trash_retention_days)
    with SessionLocal() as db:
        for f in db.scalars(select(StoredFile).where(StoredFile.deleted_at.is_not(None), StoredFile.deleted_at < cutoff)):
            keys = [v.storage_key for v in f.versions]
            db.delete(f)
            db.commit()
            for k in keys:
                storage_service.delete_object(k)


def start() -> None:
    scheduler.add_job(expiry_reminders, "interval", minutes=30, id="expiry_reminders", replace_existing=True)
    scheduler.add_job(record_expired_links, "interval", minutes=2, id="record_expired_links", replace_existing=True)
    scheduler.add_job(purge_trash, "cron", hour=3, id="purge_trash", replace_existing=True)
    scheduler.start()


def stop() -> None:
    if scheduler.running:
        scheduler.shutdown(wait=False)
