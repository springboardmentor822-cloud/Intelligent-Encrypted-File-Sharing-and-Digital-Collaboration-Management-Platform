"""Upload (validate -> encrypt -> store), list/search, download (decrypt), trash/restore, favorites, per-user permissions."""
import hashlib
import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from sqlalchemy import func, literal, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.crypto import get_key_manager
from app.core.deps import client_ip, get_current_user, is_admin, rate_limit, require_roles
from app.core.storage import get_storage
from app.core.validation import UploadValidationError, category_for_mime, validate_upload
from app.db.mongo import mongo_db
from app.db.postgres import get_db
from app.models.mongo import FileMetadataDoc
from app.models.postgres import PERMISSION_LEVELS, Favorite, FilePermission, Folder, StoredFile, User, utcnow
from app.schemas.files import FileOut, PermissionIn, PermissionOut
from app.services.audit import log_event
from app.services.file_service import read_decrypted, stream_response
from app.services.notifications import notify_user
from app.services.storage_watch import check_platform_storage, platform_used
from app.services.tripwire import check_tripwire
from app.services.trash import purge_file

router = APIRouter(prefix="/files", tags=["Files"])

CATEGORY_MIMES = {
    "image": lambda c: StoredFile.mime_type.like("image/%"),
    "video": lambda c: StoredFile.mime_type.like("video/%"),
    "pdf": lambda c: StoredFile.mime_type == "application/pdf",
    "document": lambda c: StoredFile.mime_type.like("%word%"),
    "spreadsheet": lambda c: or_(StoredFile.mime_type.like("%excel%"), StoredFile.mime_type.like("%spreadsheet%"),
                                 StoredFile.mime_type == "text/csv"),
    "presentation": lambda c: or_(StoredFile.mime_type.like("%powerpoint%"), StoredFile.mime_type.like("%presentation%")),
    "text": lambda c: StoredFile.mime_type == "text/plain",
}


async def access_level_for(db: AsyncSession, f: StoredFile, user: User) -> str | None:
    """Owner and Admin role -> 'admin'. Otherwise look in file_permissions."""
    if f.owner_id == user.id or is_admin(user):
        return "admin"
    perm = (await db.execute(
        select(FilePermission).where(FilePermission.file_id == f.id, FilePermission.user_id == user.id)
    )).scalar_one_or_none()
    return perm.level if perm else None


async def require_file_access(db: AsyncSession, request: Request, file_id: str, user: User, needed: str,
                              action: str, allow_deleted: bool = False) -> StoredFile:
    f = await db.get(StoredFile, file_id)
    if not f or (f.deleted_at is not None and not allow_deleted):  # a trashed file behaves like a missing one
        raise HTTPException(404, "File not found")
    level = await access_level_for(db, f, user)
    if level is None or PERMISSION_LEVELS[level] < PERMISSION_LEVELS[needed]:
        await log_event(action, request, user=user, owner_id=f.owner_id, result="failure",
                        resource_type="file", resource_id=f.id, details={"reason": "forbidden", "needed": needed})
        raise HTTPException(403, f"You need '{needed}' permission for this file")
    return f


def to_out(f: StoredFile, owner_email: str, user: User, level: str, fav: bool = False) -> FileOut:
    return FileOut(
        id=f.id, original_name=f.original_name, mime_type=f.mime_type, category=category_for_mime(f.mime_type),
        size_bytes=f.size_bytes, folder_id=f.folder_id, created_at=f.created_at, owner_id=f.owner_id,
        owner_email=owner_email, is_owner=f.owner_id == user.id, access_level=level,
        is_favorite=fav, deleted_at=f.deleted_at, kek_version=f.kek_version,
    )


async def build_out(db: AsyncSession, user: User, rows: list) -> list[FileOut]:
    """rows = [(StoredFile, owner_email, access_level)]. Adds the star (favorite) flag with ONE extra query."""
    ids = [f.id for f, _, _ in rows]
    favs = set()
    if ids:
        favs = {fid for (fid,) in (await db.execute(
            select(Favorite.file_id).where(Favorite.user_id == user.id, Favorite.file_id.in_(ids)))).all()}
    return [to_out(f, email, user, level, f.id in favs) for f, email, level in rows]


# ------------------------------------------------------------------ upload
@router.post("/upload", response_model=FileOut, status_code=201, dependencies=[Depends(rate_limit("upload", 60, 60))])
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    folder_id: str | None = Form(None),
    user: User = Depends(require_roles("user", "admin")),  # Guests cannot upload
    db: AsyncSession = Depends(get_db),
):
    # 1) chunked intake with a hard size limit
    chunks, total = [], 0
    while True:
        chunk = await file.read(1024 * 1024)
        if not chunk:
            break
        total += len(chunk)
        if total > settings.max_upload_bytes:
            await log_event("upload", request, user=user, result="failure",
                            details={"reason": "too_large", "file": file.filename, "category": "policy_violation"})
            raise HTTPException(413, f"File is too large. Maximum is {settings.MAX_UPLOAD_MB} MB")
        chunks.append(chunk)
    data = b"".join(chunks)

    # 2) validation (type, MIME, magic bytes, name)
    try:
        clean_name, mime = validate_upload(file.filename or "", file.content_type, data)
    except UploadValidationError as e:
        await log_event("upload", request, user=user, result="failure", severity="critical" if e.category == "file_threat" else None,
                        details={"reason": str(e), "file": file.filename, "category": e.category})
        raise HTTPException(400, str(e))

    # 3) folder + quota checks
    if folder_id:
        folder = await db.get(Folder, folder_id)
        if not folder or folder.owner_id != user.id:
            raise HTTPException(404, "Folder not found")
    used = (await db.execute(select(func.coalesce(func.sum(StoredFile.size_bytes), 0))
                             .where(StoredFile.owner_id == user.id))).scalar()
    if used + len(data) > settings.quota_bytes:
        raise HTTPException(413, f"Your storage limit of {settings.STORAGE_LIMIT_MB} MB is full. Delete files (and empty the Trash) to free space.")

    if await platform_used(db) + len(data) > settings.platform_capacity_bytes:     # the whole platform has a limit too (1 GB)
        await log_event("upload", request, user=user, result="failure", details={"reason": "platform_storage_full", "file": file.filename, "category": "policy_violation"})
        raise HTTPException(507, f"The platform storage ({settings.STORAGE_LIMIT_MB} MB) is full. Please ask an administrator to free space.")

    # 4) encrypt in memory with a fresh DEK, store ONLY ciphertext
    file_id = uuid.uuid4().hex
    payload = get_key_manager().encrypt_file(data, file_id)
    storage_key = f"{user.id}/{file_id}.enc"
    storage = get_storage()
    await storage.put(storage_key, payload.ciphertext)

    # 5) save key metadata (PostgreSQL) + file metadata (MongoDB)
    record = StoredFile(
        id=file_id, owner_id=user.id, folder_id=folder_id, original_name=clean_name, mime_type=mime,
        size_bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), storage_key=storage_key,
        nonce=payload.nonce_b64, wrapped_dek=payload.wrapped_dek_b64, kek_version=payload.kek_version,
    )
    try:
        db.add(record)
        await db.commit()
    except Exception:
        await storage.delete(storage_key)  # don't leave orphan files behind
        raise
    await mongo_db.file_metadata.insert_one(FileMetadataDoc(
        file_id=file_id, owner_id=user.id, original_name=clean_name, extension=clean_name.rsplit(".", 1)[1].lower(),
        mime_type=mime, size_bytes=len(data), sha256=record.sha256, folder_id=folder_id, kek_version=payload.kek_version,
    ).model_dump())
    await log_event("upload", request, user=user, owner_id=user.id, resource_type="file", resource_id=file_id,
                    details={"name": clean_name, "size": len(data)})
    await check_platform_storage(db)     # warn the admins when the platform is nearly full
    return to_out(record, user.email, user, "admin")


# ------------------------------------------------------------------ list / search
@router.get("", response_model=list[FileOut])
async def list_files(
    folder_id: str | None = None,
    q: str | None = None,
    category: str | None = None,
    scope: str = "mine",  # mine | shared | favorites | recent | trash
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    alive = StoredFile.deleted_at.is_(None)  # files in the Trash are hidden everywhere except scope=trash
    if scope == "shared":
        query = (select(StoredFile, User.email, FilePermission.level)
                 .join(FilePermission, FilePermission.file_id == StoredFile.id)
                 .join(User, User.id == StoredFile.owner_id)
                 .where(FilePermission.user_id == user.id, alive))
    elif scope == "trash":
        query = (select(StoredFile, User.email, literal("admin"))
                 .join(User, User.id == StoredFile.owner_id)
                 .where(StoredFile.owner_id == user.id, StoredFile.deleted_at.is_not(None)))
    elif scope in ("favorites", "recent"):
        # files I own OR that were shared with me; the user's own star / activity decides what is listed
        shared_ids = select(FilePermission.file_id).where(FilePermission.user_id == user.id)
        query = (select(StoredFile, User.email).join(User, User.id == StoredFile.owner_id)
                 .where(alive, or_(StoredFile.owner_id == user.id, StoredFile.id.in_(shared_ids))))
        order: list[str] = []
        if scope == "favorites":
            query = query.where(StoredFile.id.in_(select(Favorite.file_id).where(Favorite.user_id == user.id)))
        else:
            cursor = mongo_db.audit_logs.aggregate([
                {"$match": {"user_id": user.id, "result": "success", "resource_type": "file",
                            "action": {"$in": ["upload", "view", "download"]}}},
                {"$group": {"_id": "$resource_id", "last": {"$max": "$timestamp"}}},
                {"$sort": {"last": -1}}, {"$limit": 40}])
            order = [d["_id"] async for d in cursor]
            query = query.where(StoredFile.id.in_(order))
    else:
        query = (select(StoredFile, User.email, literal("admin"))
                 .join(User, User.id == StoredFile.owner_id).where(StoredFile.owner_id == user.id, alive))
        if not q:  # when searching, look in ALL folders; otherwise only the open folder
            if folder_id:
                query = query.where(StoredFile.folder_id == folder_id)
            else:
                query = query.where(StoredFile.folder_id.is_(None))
    if q:
        query = query.where(StoredFile.original_name.ilike(f"%{q}%"))
    if category in CATEGORY_MIMES:
        query = query.where(CATEGORY_MIMES[category](category))
    rows = (await db.execute(query.order_by(StoredFile.created_at.desc()).limit(500))).all()

    if scope in ("favorites", "recent"):  # these two queries did not know the access level yet
        perms = {fid: lvl for fid, lvl in (await db.execute(
            select(FilePermission.file_id, FilePermission.level).where(FilePermission.user_id == user.id))).all()}
        rows = [(f, email, "admin" if f.owner_id == user.id else perms.get(f.id, "view")) for f, email in rows]
        if scope == "recent":
            rows.sort(key=lambda r: order.index(r[0].id))  # most recently touched first
    return await build_out(db, user, rows)


@router.get("/counts")
async def sidebar_counts(user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Small numbers shown next to Trash / Favorites / Shared in the sidebar."""
    trash = (await db.execute(select(func.count()).select_from(StoredFile).where(
        StoredFile.owner_id == user.id, StoredFile.deleted_at.is_not(None)))).scalar()
    favorites = (await db.execute(select(func.count()).select_from(Favorite).join(StoredFile, StoredFile.id == Favorite.file_id)
                                  .where(Favorite.user_id == user.id, StoredFile.deleted_at.is_(None)))).scalar()
    shared_with_me = (await db.execute(select(func.count()).select_from(FilePermission).join(StoredFile, StoredFile.id == FilePermission.file_id)
                                       .where(FilePermission.user_id == user.id, StoredFile.deleted_at.is_(None)))).scalar()
    return {"trash": trash, "favorites": favorites, "shared_with_me": shared_with_me}


# ------------------------------------------------------------------ favorites (star)
@router.post("/{file_id}/favorite")
async def add_favorite(file_id: str, request: Request, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    await require_file_access(db, request, file_id, user, "view", "favorite")
    exists = (await db.execute(select(Favorite).where(Favorite.user_id == user.id, Favorite.file_id == file_id))).scalar_one_or_none()
    if not exists:
        db.add(Favorite(user_id=user.id, file_id=file_id))
        await db.commit()
    return {"is_favorite": True}


@router.delete("/{file_id}/favorite")
async def remove_favorite(file_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    fav = (await db.execute(select(Favorite).where(Favorite.user_id == user.id, Favorite.file_id == file_id))).scalar_one_or_none()
    if fav:
        await db.delete(fav)
        await db.commit()
    return {"is_favorite": False}


# ------------------------------------------------------------------ download / view
@router.get("/{file_id}/download")
async def download_file(file_id: str, request: Request, inline: bool = False,
                        user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    needed = "view" if inline else "download"
    f = await require_file_access(db, request, file_id, user, needed, "download")
    data = await read_decrypted(f)  # decrypted in memory only
    await log_event("view" if inline else "download", request, user=user, owner_id=f.owner_id,
                    resource_type="file", resource_id=f.id, details={"name": f.original_name})
    await check_tripwire(f.id, f.original_name, user.id, user.email, client_ip(request), "previewed" if inline else "downloaded")
    if not inline and f.owner_id != user.id:   # a person the file was shared with downloaded it: tell the owner
        owner = await db.get(User, f.owner_id)
        if owner:
            when = utcnow().strftime("%d %b %Y, %H:%M UTC")
            await notify_user(owner.id, owner.email, "Your shared file was downloaded",
                              f"{user.full_name} ({user.email}) downloaded '{f.original_name}' on {when}.",
                              ntype="file_downloaded", link="/activity")
    return stream_response(data, f.original_name, f.mime_type, inline)


# ------------------------------------------------------------------ trash / restore / delete forever
@router.delete("/trash/empty")
async def empty_trash(request: Request, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    files = (await db.execute(select(StoredFile).where(StoredFile.owner_id == user.id,
                                                       StoredFile.deleted_at.is_not(None)))).scalars().all()
    for f in files:
        await purge_file(db, f)
    await log_event("delete_permanent", request, user=user, owner_id=user.id, severity="warning",
                    details={"count": len(files), "reason": "empty_trash"})
    return {"deleted": len(files)}


@router.delete("/{file_id}")
async def delete_file(file_id: str, request: Request, user: User = Depends(get_current_user),
                      db: AsyncSession = Depends(get_db)):
    """Moves the file to the Trash (soft delete). It can be restored for TRASH_RETENTION_DAYS."""
    f = await require_file_access(db, request, file_id, user, "admin", "delete")
    f.deleted_at = utcnow()
    await db.commit()
    await log_event("delete", request, user=user, owner_id=f.owner_id, resource_type="file", resource_id=file_id,
                    severity="warning", details={"name": f.original_name, "to_trash": True})
    return {"message": "Moved to Trash"}


@router.post("/{file_id}/restore", response_model=FileOut)
async def restore_file(file_id: str, request: Request, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    f = await require_file_access(db, request, file_id, user, "admin", "restore", allow_deleted=True)
    if f.deleted_at is None:
        raise HTTPException(400, "This file is not in the Trash")
    f.deleted_at = None
    await db.commit()
    await log_event("restore", request, user=user, owner_id=f.owner_id, resource_type="file", resource_id=file_id,
                    details={"name": f.original_name})
    owner = await db.get(User, f.owner_id)
    return (await build_out(db, user, [(f, owner.email, "admin")]))[0]


@router.delete("/{file_id}/permanent")
async def delete_forever(file_id: str, request: Request, user: User = Depends(get_current_user),
                         db: AsyncSession = Depends(get_db)):
    """Only files already in the Trash can be deleted forever (two steps protect against accidents)."""
    f = await require_file_access(db, request, file_id, user, "admin", "delete", allow_deleted=True)
    if f.deleted_at is None:
        raise HTTPException(400, "Move the file to the Trash first")
    name, owner_id = f.original_name, f.owner_id
    await purge_file(db, f)
    await log_event("delete_permanent", request, user=user, owner_id=owner_id, resource_type="file",
                    resource_id=file_id, severity="warning", details={"name": name})
    return {"message": "File deleted permanently"}


# ------------------------------------------------------------------ per-user permissions
@router.get("/{file_id}/permissions", response_model=list[PermissionOut])
async def list_permissions(file_id: str, request: Request, user: User = Depends(get_current_user),
                           db: AsyncSession = Depends(get_db)):
    await require_file_access(db, request, file_id, user, "admin", "permission_list")
    rows = (await db.execute(
        select(FilePermission, User).join(User, User.id == FilePermission.user_id)
        .where(FilePermission.file_id == file_id)
    )).all()
    return [PermissionOut(id=p.id, user_id=u.id, email=u.email, full_name=u.full_name, level=p.level) for p, u in rows]


@router.post("/{file_id}/permissions", response_model=PermissionOut, status_code=201)
async def grant_permission(file_id: str, body: PermissionIn, request: Request,
                           user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    f = await require_file_access(db, request, file_id, user, "admin", "permission_grant")
    target = (await db.execute(select(User).where(User.email == body.email.lower()))).scalar_one_or_none()
    if not target:
        raise HTTPException(404, "No user with that email")
    if target.id == f.owner_id:
        raise HTTPException(400, "The owner already has full access")
    perm = (await db.execute(select(FilePermission).where(FilePermission.file_id == file_id,
                                                          FilePermission.user_id == target.id))).scalar_one_or_none()
    if perm:
        perm.level = body.level
    else:
        perm = FilePermission(file_id=file_id, user_id=target.id, level=body.level, granted_by=user.id)
        db.add(perm)
    await db.commit()
    await log_event("permission_grant", request, user=user, owner_id=f.owner_id, resource_type="file",
                    resource_id=file_id, details={"to": target.email, "level": body.level})
    await notify_user(target.id, target.email, "A file was shared with you",
                      f"{user.full_name} ({user.email}) shared '{f.original_name}' with you ({body.level} access).",
                      send_mail=True, ntype="file_shared", link="/shared")
    return PermissionOut(id=perm.id, user_id=target.id, email=target.email, full_name=target.full_name, level=perm.level)


@router.delete("/{file_id}/permissions/{perm_id}")
async def revoke_permission(file_id: str, perm_id: str, request: Request, user: User = Depends(get_current_user),
                            db: AsyncSession = Depends(get_db)):
    f = await require_file_access(db, request, file_id, user, "admin", "permission_revoke")
    perm = await db.get(FilePermission, perm_id)
    if not perm or perm.file_id != file_id:
        raise HTTPException(404, "Permission not found")
    await db.delete(perm)
    await db.commit()
    await log_event("permission_revoke", request, user=user, owner_id=f.owner_id, resource_type="file", resource_id=file_id)
    return {"message": "Access removed"}
