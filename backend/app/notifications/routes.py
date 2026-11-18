from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from pydantic import BaseModel

from app.models import User, UserRole
from app.security import get_current_user, require_role
from app.notifications.service import notification_service
from app.notifications.schemas import (
    NotificationResponse,
    NotificationListResponse,
    MarkReadRequest
)

router = APIRouter(prefix="/notifications", tags=["Notifications & Security Alerts"])


@router.get("", response_model=NotificationListResponse)
async def get_my_notifications(
    limit: int = Query(50, ge=1, le=200),
    unread_only: bool = Query(False),
    current_user: User = Depends(get_current_user)
):
    """
    Retrieve user's notifications, unread count, and notification history.
    Admins receive security alerts in addition to personal notifications.
    """
    is_admin = (current_user.role == UserRole.ADMIN)
    docs, total, unread_count = await notification_service.get_user_notifications(
        user_id=current_user.id,
        is_admin=is_admin,
        limit=limit,
        unread_only=unread_only
    )

    clean_records = []
    for d in docs:
        clean_records.append(NotificationResponse(
            notification_id=d.get("notification_id", str(d.get("_id"))),
            user_id=d.get("user_id"),
            notification_title=d.get("notification_title", "Notification"),
            notification_message=d.get("notification_message", ""),
            notification_type=d.get("notification_type", "system"),
            priority=d.get("priority", "normal"),
            is_read=d.get("is_read", False),
            created_at=d.get("created_at", ""),
            date_and_time=d.get("date_and_time", d.get("created_at", "")),
            target_url=d.get("target_url"),
            file_id=d.get("file_id"),
            file_name=d.get("file_name"),
            details=d.get("details")
        ))

    return NotificationListResponse(
        total=total,
        unread_count=unread_count,
        notifications=clean_records
    )


@router.post("/mark-read")
async def mark_notifications_read(
    req: MarkReadRequest,
    current_user: User = Depends(get_current_user)
):
    """
    Implement mark-as-read option (single, multiple, or mark all).
    """
    is_admin = (current_user.role == UserRole.ADMIN)
    modified = await notification_service.mark_notifications_as_read(
        user_id=current_user.id,
        notification_ids=req.notification_ids,
        mark_all=req.mark_all,
        is_admin=is_admin
    )
    return {"status": "success", "modified_count": modified}


@router.delete("")
async def clear_all_notifications(current_user: User = Depends(get_current_user)):
    """
    Clear notification history for the current user.
    """
    is_admin = (current_user.role == UserRole.ADMIN)
    deleted = await notification_service.clear_notifications(
        user_id=current_user.id,
        is_admin=is_admin
    )
    return {"status": "success", "deleted_count": deleted}


@router.post("/check-expirations")
async def trigger_expiration_reminders(current_user: User = Depends(get_current_user)):
    """
    Scans upcoming link expirations and dispatches reminders to owners.
    """
    from app.database import mongo_db
    from datetime import datetime, timezone, timedelta

    now = datetime.now(timezone.utc)
    in_24h = now + timedelta(hours=24)

    # Find active shares expiring within 24 hours
    cursor = mongo_db.file_shares.find({
        "is_active": True,
        "expires_at": {"$ne": None}
    })
    shares = await cursor.to_list(length=200)

    reminders_sent = 0
    for s in shares:
        try:
            exp_dt = datetime.fromisoformat(s["expires_at"].replace("Z", "+00:00"))
            if now < exp_dt <= in_24h:
                # Check if reminder was already sent
                existing_reminder = await mongo_db.notifications.find_one({
                    "user_id": s["owner_id"],
                    "notification_type": "link_expiration",
                    "file_name": s["item_name"]
                })
                if not existing_reminder:
                    await notification_service.notify_link_expiration_reminder(
                        owner_id=s["owner_id"],
                        owner_email=None,
                        file_name=s["item_name"],
                        expires_at_iso=s["expires_at"],
                        share_token=s["share_token"]
                    )
                    reminders_sent += 1
        except Exception:
            pass

    return {"status": "success", "reminders_sent": reminders_sent}

