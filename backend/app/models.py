import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Boolean, DateTime, Enum
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