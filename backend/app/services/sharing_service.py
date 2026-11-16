import secrets
import hashlib
from datetime import datetime, timedelta
from typing import Optional, List, Tuple
from sqlalchemy.orm import Session

from app.models.file import FileRecord
from app.models.share_link import ShareLink
from app.models.user import User


class SharingService:
    """
    Secure File Sharing Service for Milestone 2:
    - Cryptographically unpredictable tokens (256-bit entropy via secrets)
    - SHA-256 token hashing for storage security
    - Access control permissions ('download' or 'view')
    - Time-limited temporary expiration (1h, 24h, 7d, etc.)
    - Immediate revocation capabilities
    - Download tracking and quota enforcement
    """

    @staticmethod
    def hash_token(token: str) -> str:
        """Computes SHA-256 hex digest of the raw token."""
        return hashlib.sha256(token.encode("utf-8")).hexdigest()

    @classmethod
    def create_share_link(
        cls,
        db: Session,
        file_id: int,
        user: User,
        expires_in_hours: int = 24,
        permission: str = "download",
        max_downloads: Optional[int] = None,
    ) -> Tuple[ShareLink, str]:
        """
        Creates a new secure sharing link for a file.
        Returns (ShareLink record, raw_token_string).
        """
        file_record = db.query(FileRecord).filter(FileRecord.id == file_id).first()
        if not file_record:
            raise ValueError("File not found.")
        
        # Only owner or admin can generate share links
        if file_record.owner_id != user.id and user.role != "admin":
            raise PermissionError("You do not have permission to share this file.")

        # Generate a high-entropy, unpredictable 256-bit URL-safe token
        raw_token = secrets.token_urlsafe(32)
        token_hash = cls.hash_token(raw_token)

        expires_at = datetime.utcnow() + timedelta(hours=expires_in_hours)

        share_link = ShareLink(
            file_id=file_id,
            created_by_id=user.id,
            token_hash=token_hash,
            permission=permission if permission in ["download", "view"] else "download",
            expires_at=expires_at,
            is_revoked=False,
            max_downloads=max_downloads,
            download_count=0,
        )
        db.add(share_link)
        db.commit()
        db.refresh(share_link)

        return share_link, raw_token

    @classmethod
    def validate_and_get_link(
        cls,
        db: Session,
        raw_token: str,
    ) -> Tuple[ShareLink, FileRecord]:
        """
        Validates token against expiration, revocation, and download limits.
        Raises ValueError if invalid, expired, or revoked.
        """
        token_hash = cls.hash_token(raw_token)
        link = db.query(ShareLink).filter(ShareLink.token_hash == token_hash).first()

        if not link:
            raise ValueError("Invalid or unknown share link.")

        if link.is_revoked:
            raise ValueError("This share link has been revoked by the owner.")

        if datetime.utcnow() > link.expires_at:
            raise ValueError("This share link has expired.")

        if link.max_downloads is not None and link.download_count >= link.max_downloads:
            raise ValueError("This share link has reached its maximum download limit.")

        file_record = db.query(FileRecord).filter(FileRecord.id == link.file_id).first()
        if not file_record:
            raise ValueError("The shared file is no longer available.")

        return link, file_record

    @classmethod
    def record_access(cls, db: Session, link: ShareLink):
        """Increments download count and updates last_accessed_at."""
        link.download_count += 1
        link.last_accessed_at = datetime.utcnow()
        db.commit()

    @classmethod
    def revoke_share_link(cls, db: Session, link_id: int, user: User) -> ShareLink:
        """Revokes an active share link."""
        link = db.query(ShareLink).filter(ShareLink.id == link_id).first()
        if not link:
            raise ValueError("Share link not found.")

        # Only link creator, file owner, or admin can revoke
        file_record = db.query(FileRecord).filter(FileRecord.id == link.file_id).first()
        if link.created_by_id != user.id and (not file_record or file_record.owner_id != user.id) and user.role != "admin":
            raise PermissionError("Not authorized to revoke this link.")

        link.is_revoked = True
        link.revoked_at = datetime.utcnow()
        db.commit()
        db.refresh(link)
        return link

    @classmethod
    def list_links_for_user(cls, db: Session, user: User) -> List[ShareLink]:
        """Lists all share links created by or owned by the user."""
        if user.role == "admin":
            return db.query(ShareLink).order_by(ShareLink.created_at.desc()).all()
        return db.query(ShareLink).filter(ShareLink.created_by_id == user.id).order_by(ShareLink.created_at.desc()).all()

