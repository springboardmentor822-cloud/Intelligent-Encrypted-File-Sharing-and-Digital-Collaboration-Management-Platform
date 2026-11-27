"""Backend authorisation for files and share links. Every protected request passes through here."""
import uuid
from datetime import datetime, timezone

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.request import RequestInfo
from app.core.security import hash_token
from app.models import FileShare, ShareLink, StoredFile, User
from app.services import audit_service as audit

RANK = {"view": 1, "download": 2, "owner": 3}


def user_access(db: Session, user: User, file: StoredFile) -> str | None:
    if file.owner_id == user.id:
        return "owner"
    share = db.scalar(select(FileShare).where(FileShare.file_id == file.id, FileShare.shared_with == user.id))
    if share and share.status == "active":
        return share.permission
    return None


def get_file_for_user(db: Session, user: User, file_id: uuid.UUID, need: str, info: RequestInfo,
                      allow_trashed: bool = False) -> tuple[StoredFile, str]:
    file = db.get(StoredFile, file_id)
    if not file:
        raise HTTPException(404, "File not found")
    access = user_access(db, user, file)
    if access is None or RANK[access] < RANK[need]:
        audit.log_access_attempt("unauthorized", f"{need} access denied", info, user)
        audit.log_security_event(audit.EVT_UNAUTHORIZED, "high", "Unauthorized access attempt", info, user,
                                 f"{user.email} tried to {need} file {file.id} without permission")
        raise HTTPException(403, "You don't have permission to do that with this file.")
    if file.deleted_at and not (allow_trashed and access == "owner"):
        raise HTTPException(404, "File not found")
    return file, access


def resolve_share_link(db: Session, token: str, need: str, info: RequestInfo) -> tuple[ShareLink, StoredFile]:
    """Validate a raw share token: exists, not revoked/expired/exhausted, file alive, permission sufficient."""
    link = db.scalar(select(ShareLink).where(ShareLink.token_hash == hash_token(token)))
    if not link:
        audit.log_access_attempt("blocked", "invalid share token", info)
        raise HTTPException(404, "This link isn't valid.")
    status = link.status
    if status != "active":
        audit.log_access_attempt("blocked", f"share link {status}", info)
        msgs = {"revoked": "The owner has revoked this link.", "expired": "This link has expired.",
                "exhausted": "This link has reached its download limit."}
        raise HTTPException(410, msgs.get(status, "This link is no longer available."))
    file = link.file
    if not file or file.deleted_at is not None or not link.creator or not link.creator.is_active \
            or link.creator.id != file.owner_id:
        audit.log_access_attempt("blocked", "share link target unavailable", info)
        raise HTTPException(410, "This file is no longer available.")
    if RANK[link.permission] < RANK[need]:
        audit.log_access_attempt("unauthorized", "share link lacks download permission", info)
        raise HTTPException(403, "This link only allows viewing, not downloading.")
    return link, file


def now_utc() -> datetime:
    return datetime.now(timezone.utc)
