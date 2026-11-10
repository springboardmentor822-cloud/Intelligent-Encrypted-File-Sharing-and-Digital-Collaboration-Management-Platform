import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum, ForeignKey, Text
from sqlalchemy.orm import relationship
from app.database import Base


class UserRole(str, enum.Enum):
    ADMIN = "admin"
    USER = "user"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    username = Column(String(100), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=True)  # Nullable to support passwordless OAuth accounts
    full_name = Column(String(255), nullable=True)

    # Role-Based Access Control (RBAC)
    role = Column(
        Enum(UserRole, name="userrole", create_type=False, values_callable=lambda obj: [e.value for e in obj]),
        default=UserRole.USER,
        nullable=False,
    )

    # Multi-Factor Authentication (MFA) Foundation
    is_mfa_enabled = Column(Boolean, default=False, nullable=False)
    mfa_secret = Column(String(255), nullable=True)

    # OAuth Identity Foundation
    oauth_provider = Column(String(50), nullable=True)      # e.g., 'google', 'github'
    oauth_provider_id = Column(String(255), nullable=True)  # Unique provider ID

    # Account status flag
    is_active = Column(Boolean, default=True, nullable=False)

    # Audit Timestamps
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def __repr__(self):
        return f"<User id={self.id} username='{self.username}' email='{self.email}' role='{self.role.value}'>"


# ==============================================================================
# MILESTONE 2: POSTGRESQL FILE METADATA & ENCRYPTION KEY REFERENCES (Task 2, 7)
# ==============================================================================

class FileRecord(Base):
    """
    PostgreSQL persistence for File Metadata, Storage Location, and Key References.
    Maintains document metadata and protected encryption key envelopes.
    """
    __tablename__ = "file_records"

    id = Column(String(64), primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_path = Column(String(500), nullable=False)
    storage_provider = Column(String(50), default="local", nullable=False)  # 's3', 'azure', 'local'
    file_size = Column(Integer, default=0, nullable=False)
    cipher_size = Column(Integer, default=0, nullable=False)
    mime_type = Column(String(100), default="application/octet-stream", nullable=False)
    category = Column(String(50), default="document", nullable=False)
    parent_folder_id = Column(String(64), nullable=True, index=True)
    is_folder = Column(Boolean, default=False, nullable=False)

    # Encryption & Key Management (Envelope Encryption)
    is_encrypted = Column(Boolean, default=True, nullable=False)
    encryption_algorithm = Column(String(50), default="AES-256-GCM", nullable=False)
    envelope_version = Column(String(20), default="2.0", nullable=False)
    file_iv = Column(String(255), nullable=True)
    file_tag = Column(String(255), nullable=True)
    encrypted_dek = Column(Text, nullable=True)  # Protected envelope key material
    dek_iv = Column(String(255), nullable=True)
    dek_tag = Column(String(255), nullable=True)
    sha256_checksum = Column(String(64), nullable=True)

    # Password Protection & Access Flags
    is_password_protected = Column(Boolean, default=False, nullable=False)
    password_hash = Column(String(255), nullable=True)
    is_starred = Column(Boolean, default=False, nullable=False)
    is_trashed = Column(Boolean, default=False, nullable=False)
    downloads_count = Column(Integer, default=0, nullable=False)

    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    owner = relationship("User", backref="files")

    def __repr__(self):
        return f"<FileRecord id='{self.id}' name='{self.name}' owner_id={self.owner_id} encrypted={self.is_encrypted}>"


# Alias for compatibility with project naming
FileMetadata = FileRecord


# ==============================================================================
# MILESTONE 2: SECURE SHARE LINKS & PERMISSIONS (Task 4, 5, 6)
# ==============================================================================

class ShareLink(Base):
    """
    PostgreSQL persistence for Granular Share Links, Expiration, and Access Control.
    Enforces 'view' vs 'download' permissions, temporary expiration, and revocation.
    """
    __tablename__ = "share_links"

    id = Column(String(64), primary_key=True, index=True)
    share_token = Column(String(128), unique=True, index=True, nullable=False)
    share_token_hash = Column(String(64), index=True, nullable=True)  # SHA-256 hash for secure token lookup
    item_id = Column(String(64), ForeignKey("file_records.id", ondelete="CASCADE"), nullable=False, index=True)
    owner_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)

    # Granular Access Control ('view' vs 'download')
    permission = Column(String(20), default="download", nullable=False)

    # Guest Passcode Protection
    has_guest_password = Column(Boolean, default=False, nullable=False)
    guest_password_hash = Column(String(255), nullable=True)

    # Expiration & Download Quota
    expiration_preset = Column(String(50), default="24h", nullable=False)
    expires_at = Column(DateTime(timezone=True), nullable=True)
    max_downloads = Column(Integer, nullable=True)
    downloads_count = Column(Integer, default=0, nullable=False)
    views_count = Column(Integer, default=0, nullable=False)

    recipient_email = Column(String(255), nullable=True)
    note = Column(Text, nullable=True)

    # Status & Lifecycle
    is_active = Column(Boolean, default=True, nullable=False)
    revoked_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    last_accessed_at = Column(DateTime(timezone=True), nullable=True)

    item = relationship("FileRecord", backref="shares")
    owner = relationship("User", backref="shares")

    def __repr__(self):
        return f"<ShareLink id='{self.id}' token='{self.share_token}' perm='{self.permission}' active={self.is_active}>"


# Alias for compatibility with project naming
FileShare = ShareLink