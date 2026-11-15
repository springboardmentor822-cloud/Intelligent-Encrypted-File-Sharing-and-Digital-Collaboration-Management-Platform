"""Notifications (Milestone 3, Task 3): in-app (MongoDB `notifications`) + e-mail (SMTP).

Every notification has a TYPE so the UI can filter and colour it:
  file_shared | file_downloaded | security_alert | link_expiring | announcement | system
Every e-mail attempt is written to `email_log` (sent / failed / skipped) so admins can see delivery status.
If SMTP is not configured the e-mail is "skipped" and printed in the backend log, so you can still demo the flow.
"""
import asyncio
import logging
import smtplib
from email.message import EmailMessage

from sqlalchemy import select

from app.core.config import settings
from app.db.mongo import mongo_db
from app.db.postgres import SessionLocal
from app.models.mongo import now
from app.models.postgres import Role, User, UserRole

logger = logging.getLogger("trustshare.notify")

NOTIFICATION_TYPES = ["file_shared", "file_downloaded", "security_alert", "link_expiring", "announcement", "access_request", "system"]


def _send_smtp(to: str, subject: str, body: str) -> None:
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.SMTP_FROM, to, subject
    msg.set_content(body)
    with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
        server.starttls()
        if settings.SMTP_USER:
            server.login(settings.SMTP_USER, settings.SMTP_PASSWORD)
        server.send_message(msg)


async def send_email(to: str, subject: str, body: str, kind: str = "notification") -> str:
    """Send one e-mail and record the result. Returns "sent", "failed" or "skipped". Never raises."""
    status, error = "sent", None
    if not settings.SMTP_HOST:
        status = "skipped"
        error = "SMTP is not configured (see .env: SMTP_HOST)"
        logger.info("EMAIL (SMTP not configured) to=%s | subject=%s | body=%s", to, subject, body)
    else:
        try:
            await asyncio.to_thread(_send_smtp, to, subject, body)
        except Exception as exc:  # e-mail must never break the main request
            status, error = "failed", type(exc).__name__
            logger.warning("Email failed: %s", error)
    try:
        await mongo_db.email_log.insert_one({"to": to, "subject": subject, "status": status, "error": error, "kind": kind, "created_at": now()})
    except Exception:
        pass
    return status


async def get_prefs(user_id: str) -> dict:
    doc = await mongo_db.notification_prefs.find_one({"_id": user_id}) or {}
    return {"email_enabled": doc.get("email_enabled", True)}


async def notify_user(user_id: str, email: str | None, title: str, message: str, send_mail: bool = False,
                      ntype: str = "system", link: str | None = None) -> None:
    """Store one in-app notification, and optionally e-mail it (unless the user turned e-mails off)."""
    email_status = None
    if send_mail and email:
        if (await get_prefs(user_id))["email_enabled"]:
            email_status = await send_email(email, title, message, kind=ntype)
        else:
            email_status = "muted"
    await mongo_db.notifications.insert_one({
        "user_id": user_id, "title": title, "message": message, "type": ntype, "link": link,
        "read": False, "email_status": email_status, "created_at": now(),
    })


async def notify_admins(title: str, message: str, ntype: str = "security_alert") -> None:
    """Tell every administrator: in-app for each admin, and ONE e-mail to the admin address (security alerts)."""
    async with SessionLocal() as db:
        rows = await db.execute(
            select(User.id, User.email).join(UserRole, UserRole.user_id == User.id)
            .join(Role, Role.id == UserRole.role_id).where(Role.name == "admin")
        )
        admins = rows.all()
    for admin_id, _ in admins:
        await notify_user(admin_id, None, title, message, send_mail=False, ntype=ntype, link="/admin/alerts" if ntype == "security_alert" else None)
    target = settings.ADMIN_EMAIL or (admins[0][1] if admins else None)
    if target:
        await send_email(target, f"[TrustShare Security] {title}", message, kind=ntype)
