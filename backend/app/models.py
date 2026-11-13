import uuid
from datetime import datetime
from sqlalchemy import (JSON, BigInteger, Boolean, DateTime, ForeignKey, Index, Integer, String, Text,
                        UniqueConstraint)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .db import Base, utcnow


def uid() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(120), default="")
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(16), default="user")          # user | admin
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    quota_bytes: Mapped[int] = mapped_column(BigInteger)
    oauth_provider: Mapped[str | None] = mapped_column(String(20), nullable=True)
    oauth_subject: Mapped[str | None] = mapped_column(String(255), nullable=True)
    prefs: Mapped[dict] = mapped_column(JSON, default=dict)
    # --- Secure Folder (per-user, password-protected private vault) ---
    secure_folder_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    secure_folder_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("oauth_provider", "oauth_subject"),)


class Folder(Base):
    __tablename__ = "folders"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    parent_id: Mapped[str | None] = mapped_column(ForeignKey("folders.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255))
    is_secure: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class File(Base):
    __tablename__ = "files"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    folder_id: Mapped[str | None] = mapped_column(ForeignKey("folders.id"), nullable=True, index=True)
    original_name: Mapped[str] = mapped_column(String(255))
    ext: Mapped[str] = mapped_column(String(16))
    mime: Mapped[str] = mapped_column(String(100))
    size: Mapped[int] = mapped_column(BigInteger)               # plaintext size
    category: Mapped[str] = mapped_column(String(16), index=True)  # documents|images|videos|others
    # --- encryption / storage metadata (no raw key material) ---
    storage_backend: Mapped[str] = mapped_column(String(16))
    storage_key: Mapped[str] = mapped_column(String(128), unique=True)
    enc_alg: Mapped[str] = mapped_column(String(20), default="AES-256-GCM")
    enc_version: Mapped[int] = mapped_column(Integer, default=1)
    nonce: Mapped[str] = mapped_column(String(32))               # base64 12-byte nonce
    wrapped_dek: Mapped[str] = mapped_column(String(128))        # base64(nonce||AESGCM(KEK, DEK))
    kek_version: Mapped[int] = mapped_column(Integer)
    is_secure: Mapped[bool] = mapped_column(Boolean, default=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    owner = relationship("User")


class Favorite(Base):
    __tablename__ = "favorites"
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), primary_key=True)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class Share(Base):
    __tablename__ = "shares"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    kind: Mapped[str] = mapped_column(String(8))                 # link | user
    recipient_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    token_hash: Mapped[str | None] = mapped_column(String(64), unique=True, nullable=True)  # sha256(token); raw token never stored
    permission: Mapped[str] = mapped_column(String(8))           # view | download
    passcode_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)  # Argon2id hash of optional passcode
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_downloads: Mapped[int | None] = mapped_column(Integer, nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    file = relationship("File")


class DownloadRecord(Base):
    __tablename__ = "download_records"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    file_id: Mapped[str] = mapped_column(ForeignKey("files.id", ondelete="CASCADE"), index=True)
    owner_id: Mapped[str] = mapped_column(String(32), index=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    share_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    action: Mapped[str] = mapped_column(String(10))              # download | view
    bytes: Mapped[int] = mapped_column(BigInteger, default=0)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)
    file = relationship("File")


class LoginEvent(Base):
    __tablename__ = "login_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    success: Mapped[bool] = mapped_column(Boolean, index=True)
    reason: Mapped[str] = mapped_column(String(40), default="")   # safe category only
    method: Mapped[str] = mapped_column(String(16), default="password")
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class SecurityEvent(Base):
    __tablename__ = "security_events"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    category: Mapped[str] = mapped_column(String(40), index=True)
    kind: Mapped[str] = mapped_column(String(12), default="observed")   # observed | blocked
    severity: Mapped[str] = mapped_column(String(14), index=True)       # informational|low|medium|high|critical
    description: Mapped[str] = mapped_column(String(255))
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource: Mapped[str | None] = mapped_column(String(120), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    disposition: Mapped[str] = mapped_column(String(40), default="logged")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class AuditLog(Base):
    """Append-only by application design; rows are hash-chained for tamper evidence."""
    __tablename__ = "audit_logs"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    action: Mapped[str] = mapped_column(String(60), index=True)
    outcome: Mapped[str] = mapped_column(String(10), default="success")  # success | denied | failure
    actor_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    owner_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)  # whose resource it concerns
    resource_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    prev_hash: Mapped[str] = mapped_column(String(64), default="")
    entry_hash: Mapped[str] = mapped_column(String(64), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class OneTimeToken(Base):
    __tablename__ = "one_time_tokens"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), index=True)
    purpose: Mapped[str] = mapped_column(String(16))             # reset | verify
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class RevokedToken(Base):
    __tablename__ = "revoked_tokens"
    jti: Mapped[str] = mapped_column(String(40), primary_key=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime)


class KeyRotation(Base):
    __tablename__ = "key_rotations"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    from_version: Mapped[int] = mapped_column(Integer)
    to_version: Mapped[int] = mapped_column(Integer)
    files_rewrapped: Mapped[int] = mapped_column(Integer, default=0)
    actor_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)


class SecurityAlert(Base):
    """Actionable security notifications surfaced in the Security Dashboard (separate from the platform Admin Dashboard).
    Examples: repeated wrong-password attempts against a user's account, unauthorized access attempts, passcode failures."""
    __tablename__ = "security_alerts"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    rule: Mapped[str | None] = mapped_column(String(60), nullable=True, index=True)  # detection rule id
    kind: Mapped[str] = mapped_column(String(40), index=True)          # failed_login | unauthorized_access | passcode_failure | ...
    severity: Mapped[str] = mapped_column(String(14), index=True)      # low|medium|high|critical
    title: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(String(400), default="")
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)   # account the alert concerns
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    resource: Mapped[str | None] = mapped_column(String(120), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    status: Mapped[str] = mapped_column(String(16), default="open", index=True)   # open | acknowledged
    acknowledged_by: Mapped[str | None] = mapped_column(String(32), nullable=True)
    acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class ActivityRecord(Base):
    """Milestone 3 — the activity stream. One row per important user/file action.

    Mirrored (best-effort) to MongoDB by ``activity_monitoring.service.record`` so the same
    records satisfy the "store activity in MongoDB" requirement while remaining queryable in SQL.
    """
    __tablename__ = "activity_records"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    activity_type: Mapped[str] = mapped_column(String(60), index=True)
    file_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(16), default="success")   # success | failed | denied
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    details: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


class Notification(Base):
    """Milestone 3 — in-app notifications and security alerts (optional SMTP email delivery)."""
    __tablename__ = "notifications"
    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(String(32), index=True)
    title: Mapped[str] = mapped_column(String(160))
    message: Mapped[str] = mapped_column(String(600), default="")
    type: Mapped[str] = mapped_column(String(40), default="system", index=True)
    severity: Mapped[str] = mapped_column(String(14), default="info", index=True)  # info | low | medium | high | critical
    link: Mapped[str | None] = mapped_column(String(200), nullable=True)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)
    email_sent: Mapped[bool] = mapped_column(Boolean, default=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow, index=True)


Index("ix_dl_owner_created", DownloadRecord.owner_id, DownloadRecord.created_at)
Index("ix_activity_user_created", ActivityRecord.user_id, ActivityRecord.created_at)
Index("ix_notification_user_read", Notification.user_id, Notification.read_at)
