from sqlalchemy import (
    Column,
    Integer,
    String,
    ForeignKey,
    DateTime,
    LargeBinary,
    Boolean,
)
from sqlalchemy.sql import func
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    role = Column(String(20), nullable=False, default="User")


class File(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)
    storage_path = Column(String(500), nullable=False)
    content_type = Column(String(100), nullable=False)
    size = Column(Integer, nullable=False)

    owner_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
        index=True,
    )

    # Encryption metadata
    encryption_nonce = Column(LargeBinary, nullable=True)
    wrapped_key = Column(LargeBinary, nullable=True)
    key_nonce = Column(LargeBinary, nullable=True)
    key_version = Column(Integer, nullable=False, default=1, server_default="1")

class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    attempted_email = Column(String(255), nullable=False, index=True)
    ip_address = Column(String(45), nullable=True)
    status = Column(String(20), nullable=False, default="Failed")
    attempted_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )

class FileShare(Base):
    __tablename__ = "file_shares"

    id = Column(Integer, primary_key=True, index=True)

    file_id = Column(
        Integer,
        ForeignKey("files.id"),
        nullable=False,
        index=True,
    )

    shared_by_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=False,
    )

    shared_with_user_id = Column(
        Integer,
        ForeignKey("users.id"),
        nullable=True,
    )

    permission = Column(String(20), nullable=False, default="Viewer")

    token_hash = Column(String(64), unique=True, nullable=True)

    expires_at = Column(DateTime(timezone=True), nullable=True)

    is_revoked = Column(Boolean, nullable=False, default=False)

    created_at = Column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),
    )