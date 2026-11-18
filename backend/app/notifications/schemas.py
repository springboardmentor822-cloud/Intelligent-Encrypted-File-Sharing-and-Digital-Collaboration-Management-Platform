from pydantic import BaseModel, Field
from typing import Optional, Dict, Any, List
from datetime import datetime

class NotificationCreate(BaseModel):
    user_id: Optional[int] = Field(None, description="Recipient User ID (or None for broadcast/admin)")
    notification_title: str = Field(..., description="Notification Title")
    notification_message: str = Field(..., description="Notification Message")
    notification_type: str = Field(..., description="file_share, file_download, security_alert, link_expiration")
    priority: str = Field("normal", description="low, normal, high, critical")
    target_url: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    send_email: bool = Field(False, description="Whether to also trigger email notification")


class NotificationResponse(BaseModel):
    notification_id: str
    user_id: Optional[int] = None
    notification_title: str
    notification_message: str
    notification_type: str
    priority: str = "normal"
    is_read: bool = False
    created_at: str
    date_and_time: str
    target_url: Optional[str] = None
    file_id: Optional[str] = None
    file_name: Optional[str] = None
    details: Optional[Dict[str, Any]] = None


class NotificationListResponse(BaseModel):
    total: int
    unread_count: int
    notifications: List[NotificationResponse]


class MarkReadRequest(BaseModel):
    notification_ids: Optional[List[str]] = None
    mark_all: bool = False

