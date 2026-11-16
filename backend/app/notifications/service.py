from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
import logging
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.notification import Notification
from app.models.user import User, UserRole
from app.models.share_link import ShareLink
from app.models.file import FileRecord
from app.notifications.email_service import EmailService

logger = logging.getLogger(__name__)


class NotificationService:
    """
    Milestone 3 Task 3: Notification and Security Alert System Service.
    Dispatches and tracks notifications across PostgreSQL, MongoDB, and Email (AWS SES/SMTP).
    """

    @classmethod
    def create_notification(
        cls,
        user_id: int,
        title: str,
        message: str,
        notification_type: str,
        link_url: Optional[str] = None,
    ) -> Notification:
        with SessionLocal() as db:
            notif = Notification(
                user_id=user_id,
                title=title,
                message=message,
                notification_type=notification_type,
                is_read=False,
                link_url=link_url,
                created_at=datetime.now(timezone.utc),
            )
            db.add(notif)
            db.commit()
            db.refresh(notif)
            return notif

    @classmethod
    def notify_file_shared(cls, recipient_email: str, sender_email: str, file_name: str, share_link_url: str):
        """Step 3 & Step 7: When a user shares a file with another user."""
        with SessionLocal() as db:
            recipient = db.query(User).filter(User.email == recipient_email).first()
            if recipient:
                cls.create_notification(
                    user_id=recipient.id,
                    title="File Shared With You",
                    message=f"{sender_email} shared the encrypted file '{file_name}' with you.",
                    notification_type="FILE_SHARED",
                    link_url=share_link_url,
                )
        # Dispatch email notification
        EmailService.send_file_shared_email(
            recipient_email=recipient_email,
            sender_email=sender_email,
            file_name=file_name,
            share_url=share_link_url,
        )

    @classmethod
    def notify_file_downloaded(cls, owner_id: int, file_name: str, downloader_info: str):
        """Step 4 & Step 7: When a shared file is downloaded, notify owner in-app and via email."""
        cls.create_notification(
            user_id=owner_id,
            title="File Downloaded",
            message=f"Your file '{file_name}' was accessed/downloaded by {downloader_info}.",
            notification_type="FILE_DOWNLOADED",
            link_url="/dashboard",
        )
        with SessionLocal() as db:
            owner = db.query(User).filter(User.id == owner_id).first()
            if owner and owner.email:
                EmailService.send_file_downloaded_email(
                    owner_email=owner.email,
                    file_name=file_name,
                    downloader_info=downloader_info,
                )

    @classmethod
    def notify_link_expiration_reminder(cls, owner_id: int, file_name: str, expires_in_text: str):
        """Step 6 & Step 7: Sharing link expiration reminder for file owner."""
        cls.create_notification(
            user_id=owner_id,
            title="Share Link Expiring Soon",
            message=f"Your share link for '{file_name}' will expire {expires_in_text}.",
            notification_type="LINK_EXPIRATION",
            link_url="/dashboard",
        )
        with SessionLocal() as db:
            owner = db.query(User).filter(User.id == owner_id).first()
            if owner and owner.email:
                EmailService.send_expiry_reminder_email(
                    owner_email=owner.email,
                    file_name=file_name,
                    expires_at=expires_in_text,
                )

    @classmethod
    def check_and_notify_expiring_links(cls, hours_window: int = 24) -> int:
        """
        Milestone 3 Task 3 Step 6: Automated Link Expiry Reminder Scanner.
        Finds active share links expiring within the specified window (default 24h)
        and sends reminders if not already alerted.
        """
        now = datetime.utcnow()
        future_cutoff = now + timedelta(hours=hours_window)
        reminders_sent = 0

        with SessionLocal() as db:
            # Query active, non-revoked links expiring soon
            expiring_links = (
                db.query(ShareLink)
                .join(FileRecord, ShareLink.file_id == FileRecord.id)
                .filter(
                    ShareLink.is_revoked == False,
                    ShareLink.expires_at > now,
                    ShareLink.expires_at <= future_cutoff,
                )
                .all()
            )

            for link in expiring_links:
                file_name = link.file.original_name if link.file else f"File #{link.file_id}"
                owner_id = link.created_by_id

                # Deduplication: check if an unread or recent reminder was sent in the last 24h
                twenty_four_hours_ago = datetime.now(timezone.utc) - timedelta(hours=24)
                existing = (
                    db.query(Notification)
                    .filter(
                        Notification.user_id == owner_id,
                        Notification.notification_type == "LINK_EXPIRATION",
                        Notification.message.like(f"%{file_name}%"),
                        Notification.created_at >= twenty_four_hours_ago,
                    )
                    .first()
                )

                if not existing:
                    time_left = link.expires_at - now
                    hours_left = max(1, int(time_left.total_seconds() // 3600))
                    expires_in_text = f"in approximately {hours_left} hour(s) ({link.expires_at.strftime('%Y-%m-%d %H:%M UTC')})"
                    cls.notify_link_expiration_reminder(owner_id, file_name, expires_in_text)
                    reminders_sent += 1
                    logger.info(f"Sent link expiry reminder to owner {owner_id} for file '{file_name}'")

        return reminders_sent

    @classmethod
    def get_user_notifications(cls, user_id: int, unread_only: bool = False, limit: int = 50) -> List[Notification]:
        with SessionLocal() as db:
            q = db.query(Notification).filter(Notification.user_id == user_id)
            if unread_only:
                q = q.filter(Notification.is_read == False)
            return q.order_by(Notification.created_at.desc()).limit(limit).all()

    @classmethod
    def get_unread_count(cls, user_id: int) -> int:
        with SessionLocal() as db:
            return db.query(Notification).filter(Notification.user_id == user_id, Notification.is_read == False).count()

    @classmethod
    def mark_as_read(cls, notification_id: int, user_id: int) -> bool:
        with SessionLocal() as db:
            notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user_id).first()
            if notif:
                notif.is_read = True
                db.commit()
                return True
            return False

    @classmethod
    def mark_all_as_read(cls, user_id: int) -> int:
        with SessionLocal() as db:
            count = (
                db.query(Notification)
                .filter(Notification.user_id == user_id, Notification.is_read == False)
                .update({Notification.is_read: True}, synchronize_session=False)
            )
            db.commit()
            return count

    @classmethod
    def delete_notification(cls, notification_id: int, user_id: int) -> bool:
        with SessionLocal() as db:
            notif = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user_id).first()
            if notif:
                db.delete(notif)
                db.commit()
                return True
            return False
