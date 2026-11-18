"""
TrustShare - Notification Service
==================================
Manages creation, storage, retrieval, and status updates for user & security notifications.
Supports:
1. File sharing notifications (sent to recipient)
2. File download notifications (sent to file owner)
3. Security alerts (sent to system administrators)
4. Link expiration reminders (sent to file owner)
5. Email notifications integration
"""

import uuid
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple
from bson import ObjectId

from app.database import mongo_db, SessionLocal
from app.models import User, UserRole
from app.notifications.models import NotificationType, NotificationPriority
from app.notifications.schemas import NotificationResponse
from app.notifications.email_service import email_service

logger = logging.getLogger("trustshare.notifications.service")


class NotificationService:

    @staticmethod
    async def create_notification(
        notification_title: str,
        notification_message: str,
        notification_type: str,
        user_id: Optional[int] = None,
        priority: str = "normal",
        target_url: Optional[str] = None,
        file_id: Optional[str] = None,
        file_name: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
        recipient_email: Optional[str] = None,
        send_email: bool = False
    ) -> Dict[str, Any]:
        """
        Stores a notification document in MongoDB 'notifications' collection.
        Mandatory Fields:
        - notification_id
        - user_id
        - notification_title
        - notification_message
        - notification_type
        - is_read (False)
        - created_at / date_and_time
        """
        try:
            notif_id = f"notif_{uuid.uuid4().hex}"
            now_iso = datetime.now(timezone.utc).isoformat()

            notif_doc = {
                "notification_id": notif_id,
                "user_id": user_id,
                "notification_title": notification_title,
                "notification_message": notification_message,
                "notification_type": notification_type,
                "priority": priority,
                "is_read": False,
                "created_at": now_iso,
                "date_and_time": now_iso,
                "target_url": target_url,
                "file_id": file_id,
                "file_name": file_name,
                "details": details or {}
            }

            res = await mongo_db.notifications.insert_one(notif_doc)
            notif_doc["_id"] = str(res.inserted_id)

            # Optional email notification delivery
            if send_email and recipient_email:
                email_service.send_email(
                    to_email=recipient_email,
                    subject=f"TrustShare: {notification_title}",
                    body_text=notification_message
                )

            return notif_doc

        except Exception as e:
            logger.error(f"[NotificationService Error] Failed to create notification: {e}")
            return {
                "notification_id": f"notif_err_{uuid.uuid4().hex[:8]}",
                "status": "error",
                "error": str(e)
            }

    @classmethod
    async def notify_file_shared(
        cls,
        sender_username: str,
        recipient_email: Optional[str],
        file_name: str,
        file_id: str,
        share_token: str,
        permission: str = "download",
        guest_password: Optional[str] = None
    ):
        """Generate file-sharing notification for the recipient."""
        share_url = f"/share/{share_token}"
        msg = f"{sender_username} shared '{file_name}' with you ({permission.upper()} access)."

        recipient_user_id = None
        if recipient_email:
            try:
                with SessionLocal() as db_session:
                    rec_user = db_session.query(User).filter(User.email == recipient_email.lower().strip()).first()
                    if rec_user:
                        recipient_user_id = rec_user.id
            except Exception:
                pass

        # 1. Store in MongoDB notifications collection
        await cls.create_notification(
            user_id=recipient_user_id,
            notification_title="New File Shared with You",
            notification_message=msg,
            notification_type=NotificationType.FILE_SHARE.value,
            priority="normal",
            target_url=share_url,
            file_id=file_id,
            file_name=file_name,
            details={"sender": sender_username, "permission": permission, "recipient_email": recipient_email}
        )

        # 2. Trigger email notification if recipient email was specified
        if recipient_email:
            email_service.send_file_share_email(
                recipient_email=recipient_email,
                sender_username=sender_username,
                file_name=file_name,
                share_url=f"http://localhost:3000{share_url}",
                permission=permission,
                guest_password=guest_password
            )

    @classmethod
    async def notify_file_downloaded(
        cls,
        owner_id: int,
        downloader_name: str,
        file_name: str,
        file_id: str
    ):
        """Generate file download notification for the file owner."""
        now_str = datetime.now(timezone.utc).strftime("%b %d, %Y at %H:%M UTC")
        msg = f"{downloader_name} downloaded your shared file '{file_name}' on {now_str}."

        await cls.create_notification(
            user_id=owner_id,
            notification_title="Shared File Downloaded",
            notification_message=msg,
            notification_type=NotificationType.FILE_DOWNLOAD.value,
            priority="normal",
            file_id=file_id,
            file_name=file_name,
            details={"downloader": downloader_name, "downloaded_at": now_str}
        )

    @classmethod
    async def notify_security_alert(
        cls,
        alert_title: str,
        alert_message: str,
        ip_address: str = "127.0.0.1",
        file_id: Optional[str] = None,
        file_name: Optional[str] = None,
        priority: str = "high"
    ):
        """
        Generate security notifications for administrators:
        - Repeated failed login attempts
        - Unauthorized file access
        - Suspicious download activities
        - Attempts to access expired sharing links
        - Attempts to access revoked sharing links
        """
        # Find all administrators to alert
        admin_ids = []
        admin_emails = []
        try:
            with SessionLocal() as db_session:
                admins = db_session.query(User).filter(User.role == UserRole.ADMIN).all()
                for a in admins:
                    admin_ids.append(a.id)
                    if a.email:
                        admin_emails.append(a.email)
        except Exception:
            pass

        # If no explicit admin users, store with user_id=None (broadcast admin alert)
        target_ids = admin_ids if admin_ids else [None]

        for aid in target_ids:
            await cls.create_notification(
                user_id=aid,
                notification_title=f"Security Alert: {alert_title}",
                notification_message=alert_message,
                notification_type=NotificationType.SECURITY_ALERT.value,
                priority=priority,
                file_id=file_id,
                file_name=file_name,
                details={"ip_address": ip_address, "security_event": True}
            )

        # Trigger critical email notification to admin emails
        for a_email in admin_emails:
            email_service.send_security_alert_email(
                admin_email=a_email,
                alert_title=alert_title,
                alert_message=alert_message,
                ip_address=ip_address
            )

    @classmethod
    async def notify_link_expiration_reminder(
        cls,
        owner_id: int,
        owner_email: Optional[str],
        file_name: str,
        expires_at_iso: str,
        share_token: str
    ):
        """Generate expiration reminder notification for the file owner."""
        exp_dt = datetime.fromisoformat(expires_at_iso.replace("Z", "+00:00"))
        exp_str = exp_dt.strftime("%Y-%m-%d %H:%M UTC")
        msg = f"Your shared link for '{file_name}' will expire on {exp_str}."

        await cls.create_notification(
            user_id=owner_id,
            notification_title="Share Link Expiring Soon",
            notification_message=msg,
            notification_type=NotificationType.LINK_EXPIRATION.value,
            priority="normal",
            target_url=f"/share/{share_token}",
            file_name=file_name,
            details={"expires_at": expires_at_iso}
        )

        if owner_email:
            email_service.send_link_expiration_email(
                owner_email=owner_email,
                file_name=file_name,
                expires_at_str=exp_str,
                share_url=f"http://localhost:3000/share/{share_token}"
            )

    @classmethod
    async def get_user_notifications(
        cls,
        user_id: int,
        is_admin: bool = False,
        limit: int = 50,
        unread_only: bool = False
    ) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Retrieves notifications for a user (including broadcast admin alerts if admin).
        Returns (notifications, total_count, unread_count).
        """
        query_clauses = [{"user_id": user_id}]
        if is_admin:
            query_clauses.append({"user_id": None})  # Broadcast admin alerts

        query: Dict[str, Any] = {"$or": query_clauses}
        if unread_only:
            query["is_read"] = False

        total = await mongo_db.notifications.count_documents(query)
        unread_count = await mongo_db.notifications.count_documents({
            "$or": query_clauses,
            "is_read": False
        })

        cursor = mongo_db.notifications.find(query).sort("created_at", -1).limit(limit)
        docs = await cursor.to_list(length=limit)

        for d in docs:
            d["_id"] = str(d["_id"])
            if "notification_id" not in d:
                d["notification_id"] = d["_id"]

        return docs, total, unread_count

    @classmethod
    async def mark_notifications_as_read(
        cls,
        user_id: int,
        notification_ids: Optional[List[str]] = None,
        mark_all: bool = False,
        is_admin: bool = False
    ) -> int:
        """Marks notifications as read."""
        user_filter = [{"user_id": user_id}]
        if is_admin:
            user_filter.append({"user_id": None})

        query: Dict[str, Any] = {"$or": user_filter}
        if not mark_all and notification_ids:
            query["notification_id"] = {"$in": notification_ids}

        res = await mongo_db.notifications.update_many(
            query,
            {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}}
        )
        return res.modified_count

    @classmethod
    async def clear_notifications(cls, user_id: int, is_admin: bool = False) -> int:
        """Deletes notifications for the user."""
        user_filter = [{"user_id": user_id}]
        if is_admin:
            user_filter.append({"user_id": None})

        res = await mongo_db.notifications.delete_many({"$or": user_filter})
        return res.deleted_count


notification_service = NotificationService()

