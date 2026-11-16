from datetime import datetime
from sqlalchemy import Column, Integer, String, BigInteger, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from app.db.session import Base


# Define the 'files' table in PostgreSQL
class FileRecord(Base):
    __tablename__ = "files"

    id = Column(Integer, primary_key=True, index=True)
    filename = Column(String(255), nullable=False)          # Generated unique name on disk (UUID)
    original_filename = Column(String(255), nullable=False) # Original name (e.g. project_report.pdf)
    file_path = Column(String(512), nullable=False)         # Path on server disk
    file_size = Column(BigInteger, nullable=False)          # File size in bytes
    content_type = Column(String(100), nullable=True)       # MIME type (e.g. application/pdf, image/png)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    uploaded_at = Column(DateTime, default=datetime.utcnow, nullable=False)

    # Milestone 2: Cryptographic & Envelope Key Management Metadata
    is_encrypted = Column(Boolean, default=True, nullable=False)
    encryption_algorithm = Column(String(50), default="AES-256-GCM", nullable=False)
    nonce = Column(String(64), nullable=True)                 # Base64-encoded 12-byte nonce
    encrypted_dek = Column(String(255), nullable=True)        # Protected DEK (wrapped with Master KEK)
    dek_nonce = Column(String(64), nullable=True)             # Nonce used to wrap DEK
    sha256_hash = Column(String(64), nullable=True)           # Plaintext SHA-256 integrity checksum

    # Relationship linking each file to its owner
    owner = relationship("User", backref="files")
