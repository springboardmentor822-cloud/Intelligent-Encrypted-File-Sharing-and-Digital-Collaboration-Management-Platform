"""Unauthenticated access through a share link. Every request re-validates token, expiry,
revocation, download limit and permission, and the file is decrypted only after those checks pass."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import or_, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.redis_client import get_redis
from app.core.request import RequestInfo, get_request_info
from app.models import ShareLink
from app.api.files import _deliver
from app.services import audit_service as audit
from app.services import file_service, notification_service, threat_service
from app.services.access_service import resolve_share_link
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/public/share", tags=["public share"])


@router.get("/{token}")
def link_info(token: str, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"public:{info.ip}", 60, 60, info)
    link, f = resolve_share_link(db, token, "view", info)
    db.execute(update(ShareLink).where(ShareLink.id == link.id).values(access_count=ShareLink.access_count + 1))
    db.commit()
    audit.log_share_event(f.id, "link_opened", info, link.id)
    audit.log_audit("share.link_opened", None, "file", f.id, info, {"link_id": str(link.id)}, owner_id=f.owner_id)
    if get_redis().set(f"alert:{link.id}:{info.ip}", 1, nx=True, ex=3600):  # one alert per visitor per hour
        notification_service.notify(db, f.owner_id, "access", "Your share link was opened",
                                    f"Someone opened the link to {f.name} (IP {info.ip}).", link="/app/shared-by-me")
        db.commit()
    remaining = None if link.max_downloads is None else max(link.max_downloads - link.download_count, 0)
    return {
        "file": {"name": f.name, "size_bytes": f.size_bytes, "content_type": f.content_type, "category": f.category},
        "owner_name": link.creator.full_name, "permission": link.permission,
        "expires_at": link.expires_at, "downloads_remaining": remaining,
    }


@router.get("/{token}/view")
def link_view(token: str, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"public:{info.ip}", 60, 60, info)
    link, f = resolve_share_link(db, token, "view", info)
    data = file_service.read_plaintext(db, f, None, info)
    audit.log_share_event(f.id, "link_viewed", info, link.id)
    return _deliver(f, data, "inline")


@router.get("/{token}/download")
def link_download(token: str, db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"public:{info.ip}", 60, 60, info)
    link, f = resolve_share_link(db, token, "download", info)
    threat_service.check_download_anomaly(f"ip:{info.ip}", info)
    data = file_service.read_plaintext(db, f, None, info)

    # Reserve a download atomically so concurrent requests cannot exceed the limit.
    res = db.execute(update(ShareLink).where(
        ShareLink.id == link.id,
        or_(ShareLink.max_downloads.is_(None), ShareLink.download_count < ShareLink.max_downloads),
    ).values(download_count=ShareLink.download_count + 1))
    db.commit()
    if res.rowcount == 0:
        audit.log_access_attempt("blocked", "share link download limit reached", info)
        raise HTTPException(410, "This link has reached its download limit.")

    audit.log_download(f, None, "link", info, link.id)
    audit.log_share_event(f.id, "link_downloaded", info, link.id)
    audit.log_audit("share.link_download", None, "file", f.id, info, {"link_id": str(link.id)}, owner_id=f.owner_id)
    notification_service.notify(db, f.owner_id, "download", "Your file was downloaded via link",
                                f"{f.name} was downloaded through a share link (IP {info.ip}).", link="/app/shared-by-me")
    db.commit()
    return _deliver(f, data, "attachment")
