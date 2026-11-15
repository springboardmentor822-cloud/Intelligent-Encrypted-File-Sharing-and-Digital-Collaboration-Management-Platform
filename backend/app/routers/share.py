"""Secure share links: cryptographic token, expiry (TTL), max downloads, password, view-only mode."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.deps import get_current_user, is_admin, rate_limit
from app.core.security import generate_url_token, hash_password, hash_token, verify_password
from app.db.postgres import get_db
from app.models.postgres import FilePermission, SharedLink, StoredFile, User, utcnow
from app.routers.files import build_out, require_file_access
from app.schemas.files import PublicAccessIn, ShareCreate, ShareOut
from app.services.audit import log_event
from app.services.file_service import read_decrypted, stream_response
from app.services.notifications import notify_user

router = APIRouter(prefix="/share", tags=["Sharing"])


def link_status(link: SharedLink) -> str:
    if link.revoked:
        return "revoked"
    if link.expires_at <= utcnow():
        return "expired"
    if link.max_downloads is not None and link.download_count >= link.max_downloads:
        return "exhausted"
    return "active"


async def link_blocker(db: AsyncSession, link: SharedLink, f: StoredFile | None) -> str | None:
    """Extra rules beyond the timer: a link must die when the file or the link creator's rights change.
    Returns the reason the link is blocked, or None if it is fine."""
    if f is None:
        return "file_deleted"
    if f.deleted_at is not None:
        return "file_in_trash"
    creator = await db.get(User, link.created_by)
    if creator is None or not creator.is_active:
        return "creator_disabled"
    if creator.id != f.owner_id and not is_admin(creator):
        perm = (await db.execute(select(FilePermission).where(
            FilePermission.file_id == f.id, FilePermission.user_id == creator.id))).scalar_one_or_none()
        if not perm or perm.level != "admin":  # creator lost the right to share this file
            return "permission_changed"
    return None


def to_share_out(link: SharedLink, file_name: str, url: str | None = None, trashed: bool = False) -> ShareOut:
    status = link_status(link)
    if trashed and status == "active":
        status = "unavailable"
    return ShareOut(
        id=link.id, file_id=link.file_id, file_name=file_name, expires_at=link.expires_at,
        max_downloads=link.max_downloads, download_count=link.download_count, allow_download=link.allow_download,
        has_password=bool(link.password_hash), status=status, created_at=link.created_at, url=url,
    )


# ---------------------------------------------------------------- owner side (login required)
@router.post("/links/{file_id}", response_model=ShareOut, status_code=201)
async def create_link(file_id: str, body: ShareCreate, request: Request, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    f = await require_file_access(db, request, file_id, user, "admin", "share_link_create")
    token = generate_url_token()  # 256 bits of randomness
    link = SharedLink(
        file_id=f.id, created_by=user.id, token_hash=hash_token(token),  # only the hash is stored
        password_hash=hash_password(body.password) if body.password else None,
        expires_at=utcnow() + timedelta(hours=body.ttl_hours),
        max_downloads=body.max_downloads, allow_download=body.allow_download,
    )
    db.add(link)
    await db.commit()
    await log_event("share_link_create", request, user=user, owner_id=f.owner_id, resource_type="file",
                    resource_id=f.id, details={"ttl_hours": body.ttl_hours, "max_downloads": body.max_downloads,
                                               "password": bool(body.password), "allow_download": body.allow_download})
    return to_share_out(link, f.original_name, url=f"{settings.FRONTEND_URL}/share/{token}")


@router.get("/links", response_model=list[ShareOut])
async def my_links(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    rows = (await db.execute(
        select(SharedLink, StoredFile.original_name, StoredFile.deleted_at)
        .join(StoredFile, StoredFile.id == SharedLink.file_id)
        .where(SharedLink.created_by == user.id).order_by(SharedLink.created_at.desc()).limit(200)
    )).all()
    return [to_share_out(l, name, trashed=deleted is not None) for l, name, deleted in rows]


@router.get("/by-me")
async def shared_by_me(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Everything I own that I have shared: with people (permissions) and/or through links."""
    files = (await db.execute(select(StoredFile).where(StoredFile.owner_id == user.id,
                                                       StoredFile.deleted_at.is_(None)))).scalars().all()
    ids = [f.id for f in files]
    if not ids:
        return []
    people: dict[str, list] = {}
    for perm, u in (await db.execute(select(FilePermission, User).join(User, User.id == FilePermission.user_id)
                                     .where(FilePermission.file_id.in_(ids)))).all():
        people.setdefault(perm.file_id, []).append({"id": perm.id, "email": u.email, "full_name": u.full_name, "level": perm.level})
    links: dict[str, list] = {}
    for link in (await db.execute(select(SharedLink).where(SharedLink.file_id.in_(ids))
                                  .order_by(SharedLink.created_at.desc()))).scalars().all():
        links.setdefault(link.file_id, []).append(
            to_share_out(link, "").model_dump(mode="json", exclude={"file_name", "url", "file_id"}))
    shared = [f for f in files if f.id in people or f.id in links]
    outs = {o.id: o for o in await build_out(db, user, [(f, user.email, "admin") for f in shared])}
    result = [{"file": outs[f.id].model_dump(mode="json"), "people": people.get(f.id, []), "links": links.get(f.id, []),
               "active_links": sum(1 for l in links.get(f.id, []) if l["status"] == "active")} for f in shared]
    return sorted(result, key=lambda r: r["file"]["created_at"], reverse=True)


@router.delete("/links/{link_id}")
async def revoke_link(link_id: str, request: Request, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    link = await db.get(SharedLink, link_id)
    f = await db.get(StoredFile, link.file_id) if link else None
    # the link's creator, the FILE OWNER and admins may revoke it
    if not link or (link.created_by != user.id and not is_admin(user) and not (f and f.owner_id == user.id)):
        raise HTTPException(404, "Link not found")
    link.revoked = True
    await db.commit()
    await log_event("share_link_revoke", request, user=user, resource_type="share_link", resource_id=link_id)
    return {"message": "Link revoked"}


# ---------------------------------------------------------------- public side (no login)
async def _load_link(db: AsyncSession, request: Request, token: str) -> tuple[SharedLink, StoredFile]:
    link = (await db.execute(select(SharedLink).where(SharedLink.token_hash == hash_token(token)))).scalar_one_or_none()
    if not link:
        await log_event("share_access", request, result="failure", severity="warning",
                        details={"reason": "unknown_token"})
        raise HTTPException(404, "This link does not exist")
    status = link_status(link)
    f = await db.get(StoredFile, link.file_id)
    if status == "active":
        status = await link_blocker(db, link, f) or "active"
    if status != "active" or not f:
        await log_event("share_access", request, owner_id=link.created_by, result="failure",
                        resource_type="share_link", resource_id=link.id, details={"reason": status})
        raise HTTPException(410, f"This link is no longer available ({status})")
    return link, f


@router.get("/public/{token}", dependencies=[Depends(rate_limit("share_info", 60, 60))])
async def public_info(token: str, request: Request, db: AsyncSession = Depends(get_db)):
    link, f = await _load_link(db, request, token)
    remaining = None if link.max_downloads is None else max(link.max_downloads - link.download_count, 0)
    return {
        "file_name": f.original_name, "size_bytes": f.size_bytes, "mime_type": f.mime_type,
        "requires_password": bool(link.password_hash), "allow_download": link.allow_download,
        "expires_at": link.expires_at, "remaining_downloads": remaining,
    }


@router.post("/public/{token}/access", dependencies=[Depends(rate_limit("share_access", 30, 60))])
async def public_access(token: str, body: PublicAccessIn, request: Request, db: AsyncSession = Depends(get_db)):
    link, f = await _load_link(db, request, token)

    if link.password_hash and not (body.password and verify_password(body.password, link.password_hash)):
        await log_event("share_access", request, owner_id=link.created_by, result="failure",
                        resource_type="share_link", resource_id=link.id, details={"reason": "wrong_password"})
        raise HTTPException(401, "Wrong password")

    if body.mode == "download":
        if not link.allow_download:
            raise HTTPException(403, "This link is view-only. Downloading is disabled.")
        # Atomic counter: two people cannot both use the last remaining download
        result = await db.execute(
            update(SharedLink)
            .where(SharedLink.id == link.id,
                   or_(SharedLink.max_downloads.is_(None), SharedLink.download_count < SharedLink.max_downloads))
            .values(download_count=SharedLink.download_count + 1)
        )
        await db.commit()
        if result.rowcount == 0:
            raise HTTPException(410, "Download limit reached for this link")

    data = await read_decrypted(f)  # decrypted in memory
    action = "share_download" if body.mode == "download" else "share_view"
    await log_event(action, request, owner_id=link.created_by, resource_type="file", resource_id=f.id,
                    details={"link_id": link.id, "name": f.original_name})
    from app.core.deps import client_ip
    from app.services.tripwire import check_tripwire

    await check_tripwire(f.id, f.original_name, None, None, client_ip(request), "opened through a share link")
    owner = await db.get(User, link.created_by)
    if owner:

        when = utcnow().strftime("%d %b %Y, %H:%M UTC")
        await notify_user(owner.id, owner.email, "Your shared file was downloaded" if body.mode == "download" else "Your shared file was viewed",
                          f"'{f.original_name}' was {'downloaded' if body.mode == 'download' else 'viewed'} through a share link "
                          f"on {when} (visitor IP {client_ip(request)}).",
                          ntype="file_downloaded", link="/shared-by-me")
    return stream_response(data, f.original_name, f.mime_type, inline=body.mode == "view")
