from fastapi import APIRouter, Depends, File as UpFile, Form, HTTPException, Query, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import asc, desc, func, select
from sqlalchemy.orm import Session
from ..db import get_db, utcnow
from ..deps import current_user
from ..models import DownloadRecord, Favorite, File, Folder, Share, User
from ..serializers import file_out
from ..services import files as fs
from ..services.audit import audit, denied
from ..services.ratelimit import rate_limit
from ..services.storage import StorageError
from ..state import storage

router = APIRouter(prefix="/api", tags=["files"])


def owned_file(db: Session, request: Request, user: User, file_id: str, *, include_deleted=False) -> File:
    """Ownership check used by every file operation. 404 for ids that do not exist; 403 (logged) for someone else's."""
    f = db.get(File, file_id)
    if not f:
        raise HTTPException(404, "File not found")
    if f.owner_id != user.id:
        denied(db, request, user_id=user.id, action="file.access_denied", resource_type="file", resource_id=f.id,
               owner_id=f.owner_id, severity="medium", description="Attempt to access another user's file")
        raise HTTPException(403, "You do not have access to this file")
    if f.is_secure:
        # Secure Folder contents are invisible to every normal file endpoint; use /api/secure-folder while unlocked.
        raise HTTPException(404, "File not found")
    if f.deleted_at and not include_deleted:
        raise HTTPException(404, "File not found")
    return f


def owned_folder(db, user, folder_id):
    if not folder_id:
        return None
    fo = db.get(Folder, folder_id)
    if not fo or fo.owner_id != user.id:
        raise HTTPException(404, "Folder not found")
    return fo


@router.post("/files/upload", status_code=201, dependencies=[Depends(rate_limit("upload", 60))])
async def upload(request: Request, file: UploadFile = UpFile(...), folder_id: str | None = Form(None),
                 user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_folder(db, user, folder_id)
    data = await fs.read_limited(file)
    f = fs.store_encrypted(db, user, file.filename or "", data, folder_id, request)
    return file_out(f)


SORTS = {"name": File.original_name, "date": File.created_at, "size": File.size, "type": File.ext}


@router.get("/files")
def list_files(view: str = "all", folder_id: str | None = None, q: str | None = None, category: str | None = None,
               sort: str = "date", order: str = "desc", page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200),
               user: User = Depends(current_user), db: Session = Depends(get_db)):
    stmt = select(File).where(File.owner_id == user.id, File.is_secure.is_(False))
    if view == "trash":
        stmt = stmt.where(File.deleted_at.is_not(None))
    else:
        stmt = stmt.where(File.deleted_at.is_(None))
    if view == "favorites":
        stmt = stmt.where(File.id.in_(select(Favorite.file_id).where(Favorite.user_id == user.id)))
    elif view == "all" and not q:
        stmt = stmt.where(File.folder_id == folder_id)
    if q:
        stmt = stmt.where(File.original_name.ilike(f"%{q.replace('%', '').replace('_', '')}%"))
    if category:
        stmt = stmt.where(File.category == category)
    if view == "recent":
        stmt = stmt.order_by(desc(File.last_accessed_at))
    else:
        col = SORTS.get(sort, File.created_at)
        stmt = stmt.order_by(asc(col) if order == "asc" else desc(col))
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    rows = db.scalars(stmt.limit(page_size).offset((page - 1) * page_size)).all()
    favs = set(db.scalars(select(Favorite.file_id).where(Favorite.user_id == user.id)))
    return {"items": [file_out(f, f.id in favs) for f in rows], "total": total, "page": page, "page_size": page_size}


@router.get("/files/{file_id}")
def get_file(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id, include_deleted=True)
    return file_out(f, bool(db.get(Favorite, (user.id, f.id))))


class PatchFile(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    folder_id: str | None = None
    move: bool = False
    model_config = {"extra": "forbid"}


@router.patch("/files/{file_id}")
def patch_file(file_id: str, body: PatchFile, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id)
    if body.move:
        owned_folder(db, user, body.folder_id); f.folder_id = body.folder_id
    if body.name:
        nm = fs.safe_name(body.name)
        if not nm or nm.rsplit(".", 1)[-1].lower() != f.ext:
            raise HTTPException(422, f"Name must keep the .{f.ext} extension")
        f.original_name = fs.unique_name(db, user.id, f.folder_id, nm, f.id)
    elif body.move:
        f.original_name = fs.unique_name(db, user.id, f.folder_id, f.original_name, f.id)
    f.last_accessed_at = utcnow(); db.commit()
    audit(db, "file.update", request=request, actor_id=user.id, owner_id=user.id, resource_type="file", resource_id=f.id)
    return file_out(f)


@router.delete("/files/{file_id}")
def delete_file(file_id: str, request: Request, permanent: bool = False, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id, include_deleted=True)
    if not permanent:
        if f.deleted_at:
            raise HTTPException(409, "File is already in Trash")
        f.deleted_at = utcnow(); db.commit()
        audit(db, "file.delete", request=request, actor_id=user.id, owner_id=user.id, resource_type="file", resource_id=f.id)
        return {"ok": True, "trashed": True}
    if not f.deleted_at:
        raise HTTPException(409, "Move the file to Trash before deleting it permanently")
    try:
        storage().delete(f.storage_key)
    except StorageError:
        raise HTTPException(503, "Storage backend unavailable")
    fid = f.id
    for m in (Share, DownloadRecord):   # shares die with the file; download history is kept anonymised via audit log
        pass
    db.query(Share).filter(Share.file_id == fid).delete()
    db.query(DownloadRecord).filter(DownloadRecord.file_id == fid).delete()
    db.query(Favorite).filter(Favorite.file_id == fid).delete()
    db.delete(f); db.commit()
    audit(db, "file.permanent_delete", request=request, actor_id=user.id, owner_id=user.id, resource_type="file", resource_id=fid)
    return {"ok": True, "deleted": True}


@router.post("/files/{file_id}/restore")
def restore(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id, include_deleted=True)
    if not f.deleted_at:
        raise HTTPException(409, "File is not in Trash")
    if f.folder_id and not db.get(Folder, f.folder_id):
        f.folder_id = None
    f.deleted_at = None; f.original_name = fs.unique_name(db, user.id, f.folder_id, f.original_name, f.id); db.commit()
    audit(db, "file.restore", request=request, actor_id=user.id, owner_id=user.id, resource_type="file", resource_id=f.id)
    return file_out(f)


@router.get("/files/{file_id}/download")
def download(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id)
    data = fs.read_decrypted(db, f, request, user.id)
    fs.record_download(db, f, request, user_id=user.id, share_id=None, action="download")
    return fs.file_response(f, data, inline=False)


@router.get("/files/{file_id}/preview")
def preview(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id)
    if f.ext not in fs.INLINE_SAFE:
        raise HTTPException(415, "Preview is not available for this file type")
    data = fs.read_decrypted(db, f, request, user.id)
    fs.record_download(db, f, request, user_id=user.id, share_id=None, action="view")
    return fs.file_response(f, data, inline=True)


@router.put("/files/{file_id}/favorite")
def fav_on(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    f = owned_file(db, request, user, file_id)
    if not db.get(Favorite, (user.id, f.id)):
        db.add(Favorite(user_id=user.id, file_id=f.id)); db.commit()
    return {"favorite": True}


@router.delete("/files/{file_id}/favorite")
def fav_off(file_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_file(db, request, user, file_id)
    fav = db.get(Favorite, (user.id, file_id))
    if fav:
        db.delete(fav); db.commit()
    return {"favorite": False}


# ---------------- folders ----------------
class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: str | None = None
    model_config = {"extra": "forbid"}


def folder_out(fo): return {"id": fo.id, "name": fo.name, "parent_id": fo.parent_id, "created_at": fo.created_at.isoformat() + "Z"}


@router.get("/folders")
def folders(parent_id: str | None = None, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_folder(db, user, parent_id)
    rows = db.scalars(select(Folder).where(Folder.owner_id == user.id, Folder.parent_id == parent_id).order_by(Folder.name)).all()
    crumbs, cur = [], db.get(Folder, parent_id) if parent_id else None
    while cur:
        crumbs.insert(0, {"id": cur.id, "name": cur.name}); cur = db.get(Folder, cur.parent_id) if cur.parent_id else None
    return {"items": [folder_out(x) for x in rows], "breadcrumbs": crumbs}


@router.post("/folders", status_code=201)
def create_folder(body: FolderIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    owned_folder(db, user, body.parent_id)
    name = fs.safe_name(body.name)
    if not name:
        raise HTTPException(422, "Invalid folder name")
    if db.scalar(select(Folder).where(Folder.owner_id == user.id, Folder.parent_id == body.parent_id, Folder.name == name)):
        raise HTTPException(409, "A folder with that name already exists here")
    fo = Folder(owner_id=user.id, parent_id=body.parent_id, name=name); db.add(fo); db.commit()
    audit(db, "folder.create", request=request, actor_id=user.id, owner_id=user.id, resource_type="folder", resource_id=fo.id)
    return folder_out(fo)


class RenameFolder(BaseModel):
    name: str = Field(min_length=1, max_length=120)


@router.patch("/folders/{folder_id}")
def rename_folder(folder_id: str, body: RenameFolder, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fo = owned_folder(db, user, folder_id)
    if not fo:
        raise HTTPException(404, "Folder not found")
    fo.name = fs.safe_name(body.name) or fo.name; db.commit()
    return folder_out(fo)


@router.delete("/folders/{folder_id}")
def delete_folder(folder_id: str, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    fo = owned_folder(db, user, folder_id)
    if not fo:
        raise HTTPException(404, "Folder not found")
    busy = db.scalar(select(func.count()).select_from(File).where(File.folder_id == fo.id, File.deleted_at.is_(None))) or \
        db.scalar(select(func.count()).select_from(Folder).where(Folder.parent_id == fo.id))
    if busy:
        raise HTTPException(409, "Folder is not empty")
    db.query(File).filter(File.folder_id == fo.id).update({File.folder_id: None})   # trashed files fall back to root
    db.delete(fo); db.commit()
    audit(db, "folder.delete", request=request, actor_id=user.id, owner_id=user.id, resource_type="folder", resource_id=folder_id)
    return {"ok": True}


# ---------------- storage / activity ----------------
@router.get("/users/me/storage")
def my_storage(user: User = Depends(current_user), db: Session = Depends(get_db)):
    rows = db.execute(select(File.category, func.count(), func.coalesce(func.sum(File.size), 0)).where(File.owner_id == user.id, File.deleted_at.is_(None)).group_by(File.category)).all()
    trash = db.execute(select(func.count(), func.coalesce(func.sum(File.size), 0)).where(File.owner_id == user.id, File.deleted_at.is_not(None))).one()
    used = fs.used_bytes(db, user.id)
    return {"used": used, "quota": user.quota_bytes, "available": max(user.quota_bytes - used, 0),
            "by_category": [{"category": c, "files": n, "bytes": int(b)} for c, n, b in rows],
            "trash": {"files": trash[0], "bytes": int(trash[1])}}
