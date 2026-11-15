"""MongoDB documents: FileMetadata, AuditLogs, SecurityAlerts (+ in-app Notifications)."""
from datetime import datetime, timezone
from typing import Any

from pydantic import BaseModel, Field

from app.db.mongo import mongo_db


def now() -> datetime:
    return datetime.now(timezone.utc)


class FileMetadataDoc(BaseModel):
    file_id: str
    owner_id: str
    original_name: str
    extension: str
    mime_type: str
    size_bytes: int
    sha256: str
    folder_id: str | None = None
    encrypted: bool = True
    kek_version: str
    uploaded_at: datetime = Field(default_factory=now)


class AuditLogDoc(BaseModel):
    action: str                      # login, upload, download, delete, share_link_create ...
    result: str = "success"          # success | failure
    severity: str = "info"           # info | warning | critical
    user_id: str | None = None
    user_email: str | None = None
    owner_id: str | None = None      # owner of the file (for share-link downloads by anonymous users)
    ip: str | None = None
    location: str | None = None      # city/country (login events only)
    user_agent: str | None = None
    resource_type: str | None = None
    resource_id: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    timestamp: datetime = Field(default_factory=now)


class SecurityAlertDoc(BaseModel):
    type: str
    severity: str = "warning"
    message: str
    user_id: str | None = None
    ip: str | None = None
    details: dict[str, Any] = Field(default_factory=dict)
    resolved: bool = False
    created_at: datetime = Field(default_factory=now)


async def ensure_indexes() -> None:
    await mongo_db.file_metadata.create_index("file_id", unique=True)
    await mongo_db.file_metadata.create_index("owner_id")
    await mongo_db.audit_logs.create_index([("timestamp", -1)])
    await mongo_db.audit_logs.create_index("user_id")
    await mongo_db.audit_logs.create_index("owner_id")
    await mongo_db.audit_logs.create_index("action")
    await mongo_db.security_alerts.create_index([("created_at", -1)])
    await mongo_db.notifications.create_index([("user_id", 1), ("created_at", -1)])
    await mongo_db.notifications.create_index([("user_id", 1), ("type", 1), ("read", 1)])
    await mongo_db.audit_logs.create_index("resource_id")
    await mongo_db.audit_logs.create_index([("action", 1), ("result", 1), ("timestamp", -1)])
    await mongo_db.security_alerts.create_index([("type", 1), ("resolved", 1)])
    await mongo_db.email_log.create_index([("created_at", -1)])
