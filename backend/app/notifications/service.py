"""Create, deliver and query notifications; optional SMTP email delivery."""
from __future__ import annotations

import smtplib
from datetime import timedelta
from email.message import EmailMessage

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import iso, utcnow
from ..models import Notification, Share, User
from ..services.mongo import mirror

TYPES = ["file_shared", "file_downloaded", "security_alert", "share_expiring", "share_expired", "system"]


def send_email(to: str | None, subject: str, body: str) -> bool:
    """Send an email when SMTP is configured and enabled. Returns True on success.

    With no SMTP configuration this is a deliberate no-op so development stays zero-setup; the
    notification row still records ``email_sent=False`` and remains visible in-app.
    """
    s = get_settings()
    if not (to and s.notifications_email_enabled and s.smtp_host):
        return False
    try:
        msg = EmailMessage()
        msg["From"] = s.smtp_from
        msg["To"] = to
        msg["Subject"] = subject[:180]
        msg.set_content(body)
        if s.smtp_ssl:
            server = smtplib.SMTP_SSL(s.smtp_host, s.smtp_port, timeout=8)
        else:
            server = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=8)
        with server:
            if s.smtp_starttls and not s.smtp_ssl:
                server.starttls()
            if s.smtp_user:
                server.login(s.smtp_user, s.smtp_password)
            server.send_message(msg)
        return True
    except Exception:  # pragma: no cover - network dependent
        return False


def notify(db: Session, user_id: str, title: str, message: str = "", *, type: str = "system",
           severity: str = "info", link: str | None = None, email: bool = False,
           meta: dict | None = None) -> Notification:
    row = Notification(user_id=user_id, title=title[:160], message=message[:600], type=type[:40],
                       severity=severity[:14], link=link, meta=meta or {}, created_at=utcnow())
    if email:
        u = db.get(User, user_id)
        row.email_sent = send_email(u.email if u else None, title, message)
    db.add(row)
    db.commit()
    mirror("notifications", {"notification_id": f"NTF-{row.id:08d}", "user_id": user_id, "title": row.title,
                             "message": row.message, "type": row.type, "severity": row.severity,
                             "read": False, "created_at": iso(row.created_at), "meta": row.meta})
    return row


def notify_admins(db: Session, title: str, message: str = "", *, type: str = "security_alert",
                  severity: str = "high", link: str = "/admin/security", email: bool = True,
                  meta: dict | None = None) -> list[Notification]:
    admins = db.execute(select(User).where(User.role == "admin", User.is_active.is_(True))).scalars().all()
    return [notify(db, a.id, title, message, type=type, severity=severity, link=link, email=email, meta=meta)
            for a in admins]


def out(n: Notification) -> dict:
    return {"id": n.id, "notification_id": f"NTF-{n.id:08d}", "title": n.title, "message": n.message,
            "type": n.type, "severity": n.severity, "link": n.link, "read": n.read_at is not None,
            "read_at": iso(n.read_at), "email_sent": bool(n.email_sent), "created_at": iso(n.created_at),
            "meta": n.meta or {}}


def unread_count(db: Session, user_id: str) -> int:
    return db.execute(select(func.count(Notification.id))
                      .where(Notification.user_id == user_id, Notification.read_at.is_(None))).scalar() or 0


def list_for(db: Session, user_id: str, *, unread_only: bool = False, type: str | None = None,
             page: int = 1, page_size: int = 30) -> dict:
    conds = [Notification.user_id == user_id]
    if unread_only:
        conds.append(Notification.read_at.is_(None))
    if type:
        conds.append(Notification.type == type)
    total = db.execute(select(func.count(Notification.id)).where(*conds)).scalar() or 0
    page = max(1, page)
    page_size = min(max(1, page_size), 100)
    rows = db.execute(select(Notification).where(*conds).order_by(Notification.id.desc())
                      .offset((page - 1) * page_size).limit(page_size)).scalars().all()
    return {"items": [out(n) for n in rows], "total": total, "page": page, "page_size": page_size,
            "unread": unread_count(db, user_id)}


def mark_read(db: Session, user_id: str, notification_id: int) -> Notification | None:
    n = db.get(Notification, notification_id)
    if not n or n.user_id != user_id:
        return None
    if n.read_at is None:
        n.read_at = utcnow()
        db.commit()
    return n


def mark_all_read(db: Session, user_id: str) -> int:
    rows = db.execute(select(Notification).where(Notification.user_id == user_id,
                                                 Notification.read_at.is_(None))).scalars().all()
    now = utcnow()
    for n in rows:
        n.read_at = now
    db.commit()
    return len(rows)


def process_expired_shares(db: Session) -> dict:
    """Notify owners once when a share link has just expired (deduplicated by share id)."""
    now = utcnow()
    shares = db.execute(select(Share).where(Share.revoked_at.is_(None), Share.expires_at <= now,
                                            Share.expires_at >= now - timedelta(days=7))).scalars().all()
    already = {n.meta.get("share_id") for n in db.execute(
        select(Notification).where(Notification.type == "share_expired")).scalars().all()}
    sent = 0
    for sh in shares:
        if sh.id in already:
            continue
        fname = sh.file.original_name if sh.file else "your file"
        notify(db, sh.owner_id, "Share link expired",
               f"The link for “{fname}” expired at {sh.expires_at.isoformat(timespec='minutes')}Z.",
               type="share_expired", severity="low", link="/app/shared-by-me", email=True,
               meta={"share_id": sh.id, "file_id": sh.file_id, "expires_at": iso(sh.expires_at)})
        try:
            from ..activity_monitoring import service as activity
            activity.record(db, "share_expired", user_id=sh.owner_id, file_id=sh.file_id,
                            details={"share_id": sh.id})
        except Exception:
            pass
        sent += 1
    return {"expired_checked": len(shares), "expired_notices_sent": sent}


def send_expiry_reminders(db: Session) -> dict:
    """Notify owners about share links expiring inside the configured reminder window (deduplicated)."""
    s = get_settings()
    now = utcnow()
    horizon = now + timedelta(hours=s.share_expiry_reminder_hours)
    shares = db.execute(select(Share).where(Share.revoked_at.is_(None), Share.expires_at > now,
                                            Share.expires_at <= horizon)).scalars().all()
    already = {n.meta.get("share_id") for n in db.execute(
        select(Notification).where(Notification.type == "share_expiring")).scalars().all()}
    sent = 0
    for sh in shares:
        if sh.id in already:
            continue
        fname = sh.file.original_name if sh.file else "your file"
        notify(db, sh.owner_id, "Share link expiring soon",
               f"The link for “{fname}” expires at {sh.expires_at.isoformat(timespec='minutes')}Z.",
               type="share_expiring", severity="low", link="/app/shared-by-me", email=True,
               meta={"share_id": sh.id, "file_id": sh.file_id, "expires_at": iso(sh.expires_at)})
        sent += 1
    return {"checked": len(shares), "reminders_sent": sent}
