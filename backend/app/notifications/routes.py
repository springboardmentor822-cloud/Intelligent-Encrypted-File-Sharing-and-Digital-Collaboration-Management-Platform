from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Query
from app.models.user import User
from app.routers.auth import get_current_active_user
from app.notifications.service import NotificationService
from app.notifications.schemas import NotificationResponse

router = APIRouter(prefix="/notifications", tags=["Notification & Alert System"])


@router.get("", response_model=List[NotificationResponse])
def get_my_notifications(
    unread_only: bool = Query(default=False),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: User = Depends(get_current_active_user),
):
    """Retrieves notifications for the current authenticated user."""
    return NotificationService.get_user_notifications(
        user_id=current_user.id,
        unread_only=unread_only,
        limit=limit,
    )


@router.get("/unread-count")
def get_unread_notification_count(
    current_user: User = Depends(get_current_active_user),
):
    """Returns number of unread notifications for badge display."""
    count = NotificationService.get_unread_count(user_id=current_user.id)
    return {"unread_count": count}


@router.patch("/{notification_id}/read")
def mark_notification_read(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
):
    """Marks a single notification as read."""
    success = NotificationService.mark_as_read(notification_id=notification_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"status": "success", "message": "Notification marked as read."}


@router.post("/mark-all-read")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_active_user),
):
    """Marks all unread notifications as read for current user."""
    updated = NotificationService.mark_all_as_read(user_id=current_user.id)
    return {"status": "success", "marked_read_count": updated}


@router.delete("/{notification_id}")
def delete_notification(
    notification_id: int,
    current_user: User = Depends(get_current_active_user),
):
    """Deletes a notification."""
    success = NotificationService.delete_notification(notification_id=notification_id, user_id=current_user.id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found.")
    return {"status": "success", "message": "Notification removed."}


@router.post("/run-expiry-check")
def trigger_expiry_check(
    hours_ahead: int = Query(default=24, ge=1, le=168),
    current_user: User = Depends(get_current_active_user),
):
    """
    Milestone 3 Task 3 Step 6: Trigger automated scan for share links expiring soon
    and dispatch reminders to file owners.
    """
    sent = NotificationService.check_and_notify_expiring_links(hours_window=hours_ahead)
    return {
        "status": "success",
        "reminders_dispatched": sent,
        "window_hours": hours_ahead,
    }


@router.post("/test-email")
def send_test_email(
    target_email: str = Query(..., description="Target email address"),
    current_user: User = Depends(get_current_active_user),
):
    """
    Milestone 3 Task 3 Step 7: Dispatches a test security notification email to verify AWS SES / SMTP.
    """
    from app.notifications.email_service import EmailService
    result = EmailService.send_email(
        to_email=target_email,
        subject="[TrustShare Verification] Email Delivery Pipeline Operational",
        html_body=f"""
        <h3>TrustShare Cryptographic Vault Notification</h3>
        <p>This email verifies that your TrustShare Email Service pipeline is active and operational.</p>
        <p>Triggered by user: <strong>{current_user.email}</strong></p>
        """,
        text_body="TrustShare Email Service pipeline is active and operational.",
        event_type="TEST_EMAIL",
    )
    return {"status": "success", "dispatch_result": result}


