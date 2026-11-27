import uuid
from datetime import datetime
from typing import Optional

from sqlalchemy import BigInteger, Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.models.user import utcnow


class Folder(Base):
    __tablename__ = "folders"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    parent_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class StoredFile(Base):
    """File metadata. The bytes live (encrypted) in object storage; see FileVersion."""

    __tablename__ = "files"

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    owner_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("users.id", ondelete="CASCADE"), index=True)
    folder_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        Uuid, ForeignKey("folders.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(255), index=True)
    content_type: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(20), index=True)  # documents | images | videos | others
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    current_version: Mapped[int] = mapped_column(Integer, default=1)
    is_favorite: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)

    owner = relationship("User", lazy="joined")
    versions = relationship(
        "FileVersion", back_populates="file", cascade="all, delete-orphan", order_by="FileVersion.version"
    )


class FileVersion(Base):
    """One encrypted object in storage, with its wrapped data-encryption key."""

    __tablename__ = "file_versions"
    __table_args__ = (UniqueConstraint("file_id", "version", name="uq_file_version"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    file_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("files.id", ondelete="CASCADE"), index=True)
    version: Mapped[int] = mapped_column(Integer)
    storage_key: Mapped[str] = mapped_column(String(300), unique=True)
    size_bytes: Mapped[int] = mapped_column(BigInteger)       # plaintext size
    encrypted_size: Mapped[int] = mapped_column(BigInteger)   # bytes actually stored
    sha256: Mapped[str] = mapped_column(String(64))           # hash of the plaintext
    wrapped_dek: Mapped[bytes] = mapped_column(LargeBinary)   # DEK encrypted by the master key / KMS
    kek_version: Mapped[str] = mapped_column(String(20), index=True)
    algorithm: Mapped[str] = mapped_column(String(20), default="AES-256-GCM")
    created_by: Mapped[Optional[uuid.UUID]] = mapped_column(Uuid, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)

    file = relationship("StoredFile", back_populates="versions")
