from datetime import datetime
from sqlalchemy import Column, Integer, String, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.db.session import Base


class ShareLink(Base):
    __tablename__ = "share_links"

    id = Column(Integer, primary_key=True, index=True)
    file_id = Column(Integer, ForeignKey("files.id", ondelete="CASCADE"), nullable=False)
    created_by_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # Cryptographically secure token hash (SHA-256) - raw token never stored in plaintext
    token_hash = Column(String(64), unique=True, index=True, nullable=False)
    
    # Permissions: 'download' or 'view'
    permission = Column(String(20), default="download", nullable=False)
    
    # Temporal & Revocation controls
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    is_revoked = Column(Boolean, default=False, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    
    # Access and download quotas
    download_count = Column(Integer, default=0, nullable=False)
    max_downloads = Column(Integer, nullable=True) # None = unlimited until expires
    last_accessed_at = Column(DateTime, nullable=True)

    # Relationships
    file = relationship("FileRecord", backref="share_links")
    created_by = relationship("User", backref="created_share_links")

