from pydantic import BaseModel, Field


class ActivityOut(BaseModel):
    id: int
    activity_id: str
    user_id: str | None = None
    user_email: str | None = None
    user_name: str | None = None
    activity_type: str
    file_id: str | None = None
    file_name: str | None = None
    status: str
    ip: str | None = None
    created_at: str | None = None
    details: dict = Field(default_factory=dict)


class ActivityPage(BaseModel):
    items: list[ActivityOut]
    total: int
    page: int
    page_size: int
