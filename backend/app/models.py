
from sqlalchemy import (
    BigInteger,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    Boolean,
    String,
    Text,
    UniqueConstraint,
    func,
)

from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    full_name = Column(String(100), nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)

    hashed_password = Column(String(255), nullable=True)
    role = Column(String(20), nullable=False, default="user")
    auth_provider = Column(String(20), nullable=False, default="local")
    provider_subject = Column(String(255), nullable=True)

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )


class LinkedProvider(Base):
    __tablename__ = "linked_providers"

    id = Column(Integer, primary_key=True, index=True)

    user_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    provider = Column(String(20), nullable=False)
    provider_subject = Column(String(255), nullable=False)

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_subject",
            name="uq_linked_provider_identity",
        ),
        UniqueConstraint(
            "user_id",
            "provider",
            name="uq_user_linked_provider",
        ),
    )


class Folder(Base):
    __tablename__ = "folders"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False)

    owner_id = Column(
        Integer,
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Nullable so existing folders remain valid.
    # Store a password hash here, never the plain-text password.
    password_hash = Column(String(255), nullable=True)

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )

    __table_args__ = (
        UniqueConstraint(
            "owner_id",
            "name",
            name="uq_folder_owner_name",
        ),
    )


class StoredFile(Base):
    __tablename__ = "stored_files"

    id = Column(Integer, primary_key=True, index=True)

    original_name = Column(String(255), nullable=False)
    stored_name = Column(String(100), unique=True, nullable=False)
    content_type = Column(
        String(255),
        nullable=False,
        default="application/octet-stream",
    )
    size_bytes = Column(BigInteger, nullable=False, default=0)

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    folder_id = Column(
        Integer,
        ForeignKey("folders.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Nullable so existing files remain valid.
    password_hash = Column(String(255), nullable=True)

    # Version 0 denotes a legacy plaintext object; new file uploads use AES-GCM.
    encryption_version = Column(Integer, nullable=False, default=0, server_default="0")
    wrapped_data_key = Column(String(512), nullable=True)
    encryption_key_id = Column(String(100), nullable=True)
    storage_backend = Column(String(20), nullable=False, default="local", server_default="local")

    created_at = Column(
        DateTime,
        nullable=False,
        server_default=func.now(),
    )


class FileShare(Base):
    __tablename__ = "file_shares"

    id = Column(Integer, primary_key=True, index=True)
    share_token = Column(String(64), nullable=False, unique=True, index=True)
    file_id = Column(Integer, ForeignKey("stored_files.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    permission = Column(String(20), nullable=False, default="download")
    revoked = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    email_status = Column(String(20), nullable=False, default="pending")
    email_attempt_count = Column(Integer, nullable=False, default=0)
    email_attempted_at = Column(DateTime, nullable=True)
    email_sent_at = Column(DateTime, nullable=True)
    email_error_category = Column(String(40), nullable=True)
    reminder_90_sent_at = Column(DateTime, nullable=True)
    reminder_90_claimed_at = Column(DateTime, nullable=True)
    reminder_30_sent_at = Column(DateTime, nullable=True)
    reminder_30_claimed_at = Column(DateTime, nullable=True)
    reminder_90_state = Column(String(20), nullable=True)
    reminder_30_state = Column(String(20), nullable=True)

    __table_args__ = (
        UniqueConstraint("file_id", "recipient_email", name="uq_file_share_recipient"),
    )


class GmailCredential(Base):
    __tablename__ = "gmail_credentials"

    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    sender_email = Column(String(255), nullable=False)
    access_token_encrypted = Column(String(4096), nullable=False)
    refresh_token_encrypted = Column(String(4096), nullable=True)
    expires_at = Column(DateTime, nullable=True)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())


class FolderShare(Base):
    __tablename__ = "folder_shares"

    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    recipient_email = Column(String(255), nullable=False, index=True)
    permission = Column(String(20), nullable=False, default="viewer")
    revoked = Column(Boolean, nullable=False, default=False)
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    email_status = Column(String(20), nullable=False, default="pending")
    email_attempt_count = Column(Integer, nullable=False, default=0)
    email_attempted_at = Column(DateTime, nullable=True)
    email_sent_at = Column(DateTime, nullable=True)
    email_error_category = Column(String(40), nullable=True)

    __table_args__ = (UniqueConstraint("folder_id", "recipient_email", name="uq_folder_share_recipient"),)


class Favorite(Base):
    __tablename__ = "favorites"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    file_id = Column(Integer, ForeignKey("stored_files.id", ondelete="CASCADE"), nullable=True, index=True)
    folder_id = Column(Integer, ForeignKey("folders.id", ondelete="CASCADE"), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("user_id", "file_id", name="uq_favorite_user_file"),
        UniqueConstraint("user_id", "folder_id", name="uq_favorite_user_folder"),
    )


class PlatformSetting(Base):
    """Persisted, non-secret Super Admin settings."""

    __tablename__ = "platform_settings"

    setting_key = Column(String(100), primary_key=True)
    value_json = Column(Text, nullable=False)
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
    updated_by = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
