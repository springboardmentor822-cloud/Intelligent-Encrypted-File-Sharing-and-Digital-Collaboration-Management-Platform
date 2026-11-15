from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class FileOut(BaseModel):
    id: str
    original_name: str
    mime_type: str
    category: str
    size_bytes: int
    folder_id: str | None
    created_at: datetime
    owner_id: str
    owner_email: str
    is_owner: bool
    access_level: str  # view | download | admin
    is_favorite: bool = False
    deleted_at: datetime | None = None
    kek_version: str | None = None  # which master key protects this file (shown as the "seal" in the UI)


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None


class FolderOut(BaseModel):
    id: str
    name: str
    parent_id: str | None
    created_at: datetime


class PermissionIn(BaseModel):
    email: EmailStr
    level: Literal["view", "download", "admin"]


class PermissionOut(BaseModel):
    id: str
    user_id: str
    email: str
    full_name: str
    level: str


class ShareCreate(BaseModel):
    ttl_hours: int = Field(default=24, ge=1, le=24 * 30)
    max_downloads: int | None = Field(default=None, ge=1, le=1000)
    password: str | None = Field(default=None, min_length=4, max_length=72)
    allow_download: bool = True


class ShareOut(BaseModel):
    id: str
    file_id: str
    file_name: str
    expires_at: datetime
    max_downloads: int | None
    download_count: int
    allow_download: bool
    has_password: bool
    status: str  # active | expired | revoked | exhausted | unavailable (file in Trash)
    created_at: datetime
    url: str | None = None  # only returned once, when the link is created


class PublicAccessIn(BaseModel):
    password: str | None = None
    mode: Literal["view", "download"] = "download"
