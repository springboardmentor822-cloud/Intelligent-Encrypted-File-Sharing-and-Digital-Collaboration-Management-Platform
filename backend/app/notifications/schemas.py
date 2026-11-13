from pydantic import BaseModel, Field


class NotificationOut(BaseModel):
    id: int
    notification_id: str
    title: str
    message: str
    type: str
    severity: str
    link: str | None = None
    read: bool
    read_at: str | None = None
    email_sent: bool = False
    created_at: str | None = None
    meta: dict = Field(default_factory=dict)


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    total: int
    page: int
    page_size: int
    unread: int
