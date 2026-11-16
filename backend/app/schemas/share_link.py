from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class CreateShareLinkRequest(BaseModel):
    expires_in_hours: int = 24
    permission: str = "download"  # "download" or "view"
    max_downloads: Optional[int] = None
    recipient_email: Optional[str] = None



class ShareLinkResponse(BaseModel):
    id: int
    file_id: int
    original_filename: str
    permission: str
    created_at: datetime
    expires_at: datetime
    is_revoked: bool
    download_count: int
    max_downloads: Optional[int] = None
    token: Optional[str] = None
    share_url: Optional[str] = None

    class Config:
        from_attributes = True


class PublicShareInfoResponse(BaseModel):
    original_filename: str
    file_size: int
    content_type: Optional[str] = None
    permission: str
    expires_at: datetime
    download_count: int
    max_downloads: Optional[int] = None
    is_valid: bool = True

