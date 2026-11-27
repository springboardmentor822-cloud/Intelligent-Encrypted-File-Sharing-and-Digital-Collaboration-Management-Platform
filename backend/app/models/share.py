import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import aware as _aware
from app.models.user import utcnow


class ShareLink(Base):
    """A temporary, revocable link. Only the SHA-256 of the token is stored."""

    __tablename__ = "share_links"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("files.id", ondelete="CASCADE"), index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    permission: Mapped[str] = mapped_column(String(10), default="view")  # view | download
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    max_downloads: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    download_count: Mapped[int] = mapped_column(Integer, default=0)
    access_count: Mapped[int] = mapped_column(Integer, default=0)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    file = relationship("StoredFile", lazy="joined")
    creator = relationship("User", lazy="joined")

    @property
    def status(self) -> str:
        from app.models.user import utcnow as now
        if self.revoked_at:
            return "revoked"
        if _aware(self.expires_at) <= now():
            return "expired"
        if self.max_downloads is not None and self.download_count >= self.max_downloads:
            return "exhausted"
        return "active"


class FileShare(Base):
    """A direct share with a specific TrustShare user."""

    __tablename__ = "file_shares"
    __table_args__ = (UniqueConstraint("file_id", "shared_with", name="uq_file_share_user"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("files.id", ondelete="CASCADE"), index=True)
    shared_by: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    shared_with: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    permission: Mapped[str] = mapped_column(String(10), default="view")
    share_type: Mapped[str] = mapped_column(String(10), default="direct")  # direct | internal
    expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    file = relationship("StoredFile", lazy="joined")
    sharer = relationship("User", foreign_keys=[shared_by], lazy="joined")
    recipient = relationship("User", foreign_keys=[shared_with], lazy="joined")

    @property
    def status(self) -> str:
        from app.models.user import utcnow as now
        if self.revoked_at:
            return "revoked"
        if self.expires_at and _aware(self.expires_at) <= now():
            return "expired"
        return "active"


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    type: Mapped[str] = mapped_column(String(30))  # share | access | download | security | expiry | system
    title: Mapped[str] = mapped_column(String(200))
    message: Mapped[str] = mapped_column(Text)
    link: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, index=True)
