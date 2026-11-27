import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.deps import get_current_user, get_member
from app.core.request import RequestInfo, get_request_info
from app.models import FileVersion, Folder, StoredFile, User, utcnow
from app.serializers import file_dict
from app.services import audit_service as audit
from app.services import file_service, notification_service, storage_service, threat_service
from app.services.access_service import get_file_for_user
from app.services.file_validation import sanitize_filename, validate_upload
from app.services.ratelimit import rate_limit

router = APIRouter(prefix="/files", tags=["files"])
CATEGORIES = ("documents", "images", "videos", "others")


# ------------------------------------------------------------------ helpers
def _read_upload(upload: UploadFile, limit: int) -> bytes:
    data = bytearray()
    while True:
        chunk = upload.file.read(1024 * 1024)
        if not chunk:
            break
        data.extend(chunk)
        if len(data) > limit:
            break
    return bytes(data)


def _validate_or_raise(filename: str, data: bytes, user: User, info: RequestInfo):
    result = validate_upload(filename, data, settings.max_upload_bytes)
    if result.ok:
        return result
    if result.kind == "threat":
        audit.log_security_event(audit.EVT_FILE_THREAT, "high", "Potentially unsafe file blocked", info, user,
                                 f"{user.email} tried to upload '{sanitize_filename(filename)}': {result.reason}")
    else:
        audit.log_security_event(audit.EVT_POLICY, "low", "Upload policy violation", info, user,
                                 f"'{sanitize_filename(filename)}': {result.reason}", notify_admins=False)
    audit.log_audit("file.upload_rejected", user, "file", None, info, {"name": sanitize_filename(filename), "reason": result.reason})
    status = 413 if "larger than" in result.reason else 400
    raise HTTPException(status, result.reason)


def _deliver(file: StoredFile, data: bytes, disposition: str) -> Response:
    ascii_name = file.name.encode("ascii", "replace").decode().replace("?", "_").replace('"', "")
    return Response(content=data, media_type=file.content_type, headers={
        "Content-Disposition": f"{disposition}; filename=\"{ascii_name}\"; filename*=UTF-8''{quote(file.name)}",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'none'; sandbox",
    })


def _check_quota(db: Session, user: User, size: int):
    if file_service.storage_used(db, user.id) + size > user.storage_quota_bytes:
        raise HTTPException(413, "You've run out of storage. Delete files or ask an admin for more space.")


# ------------------------------------------------------------------ storage (declared before /{file_id})
@router.get("/storage/usage")
def storage_usage(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = db.execute(
        select(StoredFile.category, func.coalesce(func.sum(FileVersion.encrypted_size), 0), func.count(func.distinct(StoredFile.id)))
        .join(FileVersion, FileVersion.file_id == StoredFile.id)
        .where(StoredFile.owner_id == user.id).group_by(StoredFile.category)
    ).all()
    by_cat = {c: {"bytes": 0, "files": 0} for c in CATEGORIES}
    for cat, size, count in rows:
        by_cat[cat] = {"bytes": int(size), "files": int(count)}
    used = sum(v["bytes"] for v in by_cat.values())
    trash = db.scalar(select(func.coalesce(func.sum(StoredFile.size_bytes), 0)).where(
        StoredFile.owner_id == user.id, StoredFile.deleted_at.is_not(None)))
    return {"used": used, "quota": user.storage_quota_bytes, "by_category": by_cat, "trash_bytes": int(trash or 0)}


# ------------------------------------------------------------------ upload
@router.post("/upload", status_code=201)
def upload(file: UploadFile = File(...), folder_id: uuid.UUID | None = Form(None),
           user: User = Depends(get_member), db: Session = Depends(get_db),
           info: RequestInfo = Depends(get_request_info)):
    rate_limit(f"upload:{user.id}", 120, 60, info)
    if folder_id:
        folder = db.get(Folder, folder_id)
        if not folder or folder.owner_id != user.id:
            raise HTTPException(404, "Folder not found")
    data = _read_upload(file, settings.max_upload_bytes)
    result = _validate_or_raise(file.filename or "", data, user, info)
    _check_quota(db, user, len(data))

    name = sanitize_filename(file.filename or "")
    file_id = uuid.uuid4()
    version = file_service.encrypt_and_store(file_id, user.id, 1, data, user.id)
    stored = StoredFile(id=file_id, owner_id=user.id, folder_id=folder_id, name=name,
                        content_type=result.content_type, category=result.category, size_bytes=len(data))
    try:
        db.add(stored)
        db.flush()
        db.add(version)
        db.commit()
    except Exception:
        db.rollback()
        storage_service.delete_object(version.storage_key)
        raise
    audit.log_audit("file.upload", user, "file", stored.id, info,
                    {"name": name, "size": len(data), "category": result.category, "kek_version": version.kek_version},
                    owner_id=user.id)
    return file_dict(stored)


@router.post("/{file_id}/versions", status_code=201)
def upload_version(file_id: uuid.UUID, file: UploadFile = File(...), user: User = Depends(get_member),
                   db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    stored, _ = get_file_for_user(db, user, file_id, "owner", info)
    data = _read_upload(file, settings.max_upload_bytes)
    result = _validate_or_raise(stored.name, data, user, info)  # must still match the file's extension
    _check_quota(db, user, len(data))
    number = stored.current_version + 1
    version = file_service.encrypt_and_store(stored.id, user.id, number, data, user.id)
    try:
        db.add(version)
        stored.current_version, stored.size_bytes, stored.updated_at = number, len(data), utcnow()
        stored.content_type = result.content_type
        db.commit()
    except Exception:
        db.rollback()
        storage_service.delete_object(version.storage_key)
        raise
    audit.log_audit("file.new_version", user, "file", stored.id, info, {"version": number, "size": len(data)}, owner_id=user.id)
    return file_dict(stored)


# ------------------------------------------------------------------ list / read
@router.get("")
def list_files(view: str = "all", folder_id: uuid.UUID | None = None, q: str | None = None,
               category: str | None = None, sort: str = "updated_at", order: str = "desc", limit: int = 500,
               user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    stmt = select(StoredFile).where(StoredFile.owner_id == user.id)
    if view == "trash":
        stmt = stmt.where(StoredFile.deleted_at.is_not(None))
    else:
        stmt = stmt.where(StoredFile.deleted_at.is_(None))
        if view == "favorites":
            stmt = stmt.where(StoredFile.is_favorite.is_(True))
        elif view == "all" and not q and not category:
            stmt = stmt.where(StoredFile.folder_id == folder_id) if folder_id else stmt.where(StoredFile.folder_id.is_(None))
    if q:
        stmt = stmt.where(StoredFile.name.ilike(f"%{q.replace('%', '').replace('_', ' ')[:100]}%"))
    if category in CATEGORIES:
        stmt = stmt.where(StoredFile.category == category)
    if view == "recent":
        sort, order, limit = "created_at", "desc", min(limit, 25)
    col = {"name": StoredFile.name, "size": StoredFile.size_bytes, "created_at": StoredFile.created_at}.get(sort, StoredFile.updated_at)
    stmt = stmt.order_by(col.asc() if order == "asc" else col.desc()).limit(min(limit, 1000))
    return {"items": [file_dict(f) for f in db.scalars(stmt).all()]}


@router.get("/{file_id}")
def get_file(file_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db),
             info: RequestInfo = Depends(get_request_info)):
    f, access = get_file_for_user(db, user, file_id, "view", info, allow_trashed=True)
    return file_dict(f, access)


@router.get("/{file_id}/versions")
def list_versions(file_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                  info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    return [{"version": v.version, "size_bytes": v.size_bytes, "sha256": v.sha256, "algorithm": v.algorithm,
             "created_at": v.created_at, "current": v.version == f.current_version} for v in f.versions]


# ------------------------------------------------------------------ download / view (decrypt)
@router.get("/{file_id}/download")
def download(file_id: uuid.UUID, version: int | None = None, user: User = Depends(get_current_user),
             db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    f, access = get_file_for_user(db, user, file_id, "download", info)
    rate_limit(f"download:{user.id}", 120, 60, info)
    threat_service.check_download_anomaly(str(user.id), info, user)
    data = file_service.read_plaintext(db, f, version if access == "owner" else None, info, user)
    via = "owner" if access == "owner" else "direct"
    audit.log_download(f, user, via, info)
    audit.log_audit("file.download", user, "file", f.id, info, {"via": via}, owner_id=f.owner_id)
    if via != "owner":
        notification_service.notify(db, f.owner_id, "download", "Your file was downloaded",
                                    f"{user.full_name} downloaded {f.name}.", link="/app/activity")
        db.commit()
    return _deliver(f, data, "attachment")


@router.get("/{file_id}/view")
def view_inline(file_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    f, access = get_file_for_user(db, user, file_id, "view", info)
    data = file_service.read_plaintext(db, f, None, info, user)
    audit.log_audit("file.view", user, "file", f.id, info, {}, owner_id=f.owner_id)
    return _deliver(f, data, "inline")


# ------------------------------------------------------------------ update / trash
class FileUpdate(BaseModel):
    name: str | None = None
    folder_id: uuid.UUID | None = None
    is_favorite: bool | None = None


@router.patch("/{file_id}")
def update_file(file_id: uuid.UUID, body: FileUpdate, user: User = Depends(get_member), db: Session = Depends(get_db),
                info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    if body.name is not None:
        new = sanitize_filename(body.name)
        old_ext = f.name.rsplit(".", 1)[-1].lower() if "." in f.name else ""
        new_ext = new.rsplit(".", 1)[-1].lower() if "." in new else ""
        if old_ext != new_ext:
            raise HTTPException(400, f"Keep the .{old_ext} extension when renaming.")
        f.name = new
    if "folder_id" in body.model_fields_set:
        if body.folder_id:
            folder = db.get(Folder, body.folder_id)
            if not folder or folder.owner_id != user.id:
                raise HTTPException(404, "Folder not found")
        f.folder_id = body.folder_id
    if body.is_favorite is not None:
        f.is_favorite = body.is_favorite
    db.commit()
    audit.log_audit("file.update", user, "file", f.id, info, body.model_dump(exclude_unset=True, mode="json"), owner_id=f.owner_id)
    return file_dict(f)


@router.delete("/{file_id}")
def move_to_trash(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                  info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info)
    f.deleted_at = utcnow()
    db.commit()
    audit.log_audit("file.trash", user, "file", f.id, info, {"name": f.name}, owner_id=f.owner_id)
    return {"ok": True}


@router.post("/{file_id}/restore")
def restore(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
            info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info, allow_trashed=True)
    f.deleted_at = None
    db.commit()
    audit.log_audit("file.restore", user, "file", f.id, info, {"name": f.name}, owner_id=f.owner_id)
    return file_dict(f)


@router.delete("/{file_id}/permanent")
def delete_permanently(file_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                       info: RequestInfo = Depends(get_request_info)):
    f, _ = get_file_for_user(db, user, file_id, "owner", info, allow_trashed=True)
    name = f.name
    keys = [v.storage_key for v in f.versions]
    db.delete(f)
    db.commit()
    for k in keys:
        storage_service.delete_object(k)
    audit.log_audit("file.delete_permanent", user, "file", file_id, info, {"name": name}, owner_id=user.id)
    return {"ok": True}
