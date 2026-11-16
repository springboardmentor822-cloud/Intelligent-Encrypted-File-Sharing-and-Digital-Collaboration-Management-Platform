from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, JSON
from app.db.session import Base


class SecurityAlert(Base):
    __tablename__ = "security_alerts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, nullable=True, index=True)
    user_email = Column(String(255), nullable=True, index=True)
    ip_address = Column(String(64), nullable=True)
    activity_type = Column(String(100), nullable=False, index=True)  # FAILED_LOGINS, UNAUTHORIZED_ACCESS, EXCESSIVE_DOWNLOADS, EXPIRED_LINK_ACCESS, REVOKED_LINK_ACCESS
    description = Column(String(512), nullable=False)
    severity = Column(String(20), default="Medium", nullable=False, index=True)  # Low, Medium, High
    status = Column(String(20), default="active", nullable=False, index=True)  # active, investigated, resolved
    timestamp = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False, index=True)
    details = Column(JSON, nullable=True)

