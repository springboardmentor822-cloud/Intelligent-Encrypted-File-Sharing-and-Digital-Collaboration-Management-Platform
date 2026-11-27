import uuid
from datetime import timedelta
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_member
from app.core.request import RequestInfo, get_request_info
from app.core.security import generate_secure_token, hash_token
from app.models import FileShare, ShareLink, StoredFile, User, utcnow
from app.serializers import file_dict, link_dict, user_share_dict
from app.services import audit_service as audit
from app.services import notification_service
from app.services.access_service import get_file_for_user
from app.core.mongo import get_mongo

router = APIRouter(prefix="/shares", tags=["sharing"])


class LinkIn(BaseModel):
    file_id: uuid.UUID
    permission: Literal["view", "download"] = "view"
    expires_in_hours: int = Field(24, ge=1)
    max_downloads: int | None = Field(None, ge=1, le=100000)


class UserShareIn(BaseModel):
    file_id: uuid.UUID
    email: EmailStr
    permission: Literal["view", "download"] = "view"
    expires_in_hours: int | None = Field(None, ge=1)


# ------------------------------------------------------------------ share links
@router.post("/links", status_code=201)
def create_link(body: LinkIn, user: User = Depends(get_member), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, body.file_id, "owner", info)
    hours = min(body.expires_in_hours, settings.share_max_hours)
    raw = generate_secure_token()  # 256 bits of randomness; only its hash is stored
    link = ShareLink(file_id=f.id, created_by=user.id, token_hash=hash_token(raw), permission=body.permission,
                     expires_at=utcnow() + timedelta(hours=hours), max_downloads=body.max_downloads)
    db.add(link)
    db.commit()
    audit.log_audit("share.link_created", user, "file", f.id, info,
                    {"permission": body.permission, "expires_in_hours": hours, "max_downloads": body.max_downloads,
                     "link_id": str(link.id)}, owner_id=f.owner_id)
    audit.log_share_event(f.id, "link_created", info, link.id, user)
    return {**link_dict(link), "token": raw, "url": f"{settings.frontend_url}/s/{raw}"}


@router.get("/links")
def list_links(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
               info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    links = db.scalars(select(ShareLink).where(ShareLink.file_id == f.id).order_by(ShareLink.created_at.desc())).all()
    return {"items": [link_dict(l) for l in links]}


@router.delete("/links/{link_id}")
def revoke_link(link_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    link = db.get(ShareLink, link_id)
    if not link or link.created_by != user.id:
        raise HTTPException(404, "Link not found")
    if not link.revoked_at:
        link.revoked_at = utcnow()
        db.commit()
        audit.log_audit("share.link_revoked", user, "file", link.file_id, info, {"link_id": str(link.id)}, owner_id=user.id)
        audit.log_share_event(link.file_id, "link_revoked", info, link.id, user)
    return link_dict(link)


# ------------------------------------------------------------------ direct shares with users
@router.post("/users", status_code=201)
def share_with_user(body: UserShareIn, user: User = Depends(get_member), db: Session = Depends(get_db),
                    info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, body.file_id, "owner", info)
    target = db.scalar(select(User).where(User.email == body.email.lower(), User.is_active.is_(True)))
    if not target:
        raise HTTPException(404, "No TrustShare account uses that email address.")
    if target.id == user.id:
        raise HTTPException(400, "This file is already yours.")
    expires = utcnow() + timedelta(hours=min(body.expires_in_hours, settings.share_max_hours)) if body.expires_in_hours else None
    share_type = "internal" if target.email.split("@")[-1] == user.email.split("@")[-1] else "direct"

    share = db.scalar(select(FileShare).where(FileShare.file_id == f.id, FileShare.shared_with == target.id))
    if share:
        share.permission, share.expires_at, share.revoked_at, share.reminder_sent = body.permission, expires, None, False
        share.share_type = share_type
    else:
        share = FileShare(file_id=f.id, shared_by=user.id, shared_with=target.id, permission=body.permission,
                          share_type=share_type, expires_at=expires)
        db.add(share)
    notification_service.notify(db, target.id, "share", f"{user.full_name} shared a file with you",
                                f"{f.name} — you can {'view and download' if body.permission == 'download' else 'view'} it.",
                                link="/app/shared-with-me", email_to=target.email)
    db.commit()
    audit.log_audit("share.user_shared", user, "file", f.id, info,
                    {"with": target.email, "permission": body.permission, "type": share_type}, owner_id=f.owner_id)
    audit.log_share_event(f.id, "user_shared", info, share.id, user, target.email)
    return user_share_dict(share)


@router.get("/users")
def list_user_shares(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                     info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    shares = db.scalars(select(FileShare).where(FileShare.file_id == f.id).order_by(FileShare.created_at.desc())).all()
    return {"items": [user_share_dict(s) for s in shares]}


@router.delete("/users/{share_id}")
def revoke_user_share(share_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                      info: RequestInfo = Depends(get_request_info)):
    share = db.get(FileShare, share_id)
    if not share or share.shared_by != user.id:
        raise HTTPException(404, "Share not found")
    if not share.revoked_at:
        share.revoked_at = utcnow()
        db.commit()
        audit.log_audit("share.user_revoked", user, "file", share.file_id, info,
                        {"with": share.recipient.email}, owner_id=user.id)
    return user_share_dict(share)


# ------------------------------------------------------------------ lists
@router.get("/with-me")
def shared_with_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    now = utcnow()
    rows = db.scalars(select(FileShare).join(StoredFile, StoredFile.id == FileShare.file_id).where(
        FileShare.shared_with == user.id, FileShare.revoked_at.is_(None), StoredFile.deleted_at.is_(None),
        or_(FileShare.expires_at.is_(None), FileShare.expires_at > now),
    ).order_by(FileShare.created_at.desc())).all()
    return {"items": [file_dict(s.file, s.permission, shared_by_name=s.sharer.full_name, share_id=s.id,
                                share_expires_at=s.expires_at, shared_at=s.created_at) for s in rows]}


@router.get("/by-me")
def shared_by_me(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    links = db.scalars(select(ShareLink).where(ShareLink.created_by == user.id).order_by(ShareLink.created_at.desc()).limit(200)).all()
    users = db.scalars(select(FileShare).where(FileShare.shared_by == user.id).order_by(FileShare.created_at.desc()).limit(200)).all()
    return {"links": [link_dict(l) for l in links], "users": [user_share_dict(s) for s in users]}


@router.get("/activity")
def share_activity(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                   info: RequestInfo = Depends(get_request_info)):
    """Share-activity monitoring for one file: link creation/revocation, opens, downloads."""
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    mdb = get_mongo()
    events = [{"ts": e["ts"], "kind": e["kind"], "ip": e.get("ip"), "details": e.get("details", "")}
              for e in mdb.share_events.find({"file_id": str(f.id)}).sort("ts", -1).limit(50)]
    downloads = [{"ts": e["ts"], "kind": f"download ({e['via']})", "ip": e.get("ip"), "details": e.get("actor_name", "")}
                 for e in mdb.download_events.find({"file_id": str(f.id)}).sort("ts", -1).limit(50)]
    merged = sorted(events + downloads, key=lambda e: e["ts"], reverse=True)[:60]
    return {"items": merged}
