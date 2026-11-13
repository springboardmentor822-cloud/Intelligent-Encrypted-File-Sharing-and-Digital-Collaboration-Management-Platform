"""Secure Folder — a per-user, password-protected private vault (like a phone's Secure Folder).

The folder password is stored only as an Argon2id hash. Unlocking issues a short-lived, purpose-scoped
token (15 min) that must accompany every request that reads or mutates secure contents. Secure files are
hidden from the normal file listing and cannot be shared while they live in the vault.
"""
import jwt
from fastapi import APIRouter, Depends, File as UpFile, Header, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..db import get_db, iso, utcnow
from ..deps import current_user
from ..models import File, User
from ..serializers import file_out
from ..services import files as fs
from ..services.audit import audit, denied, raise_alert, security_event
from ..services.ratelimit import rate_limit
from ..services.security import (create_scope_token, decode_scope_token, hash_password, password_problem,
                                 verify_password)

router = APIRouter(prefix="/api/secure-folder", tags=["secure-folder"])


class SetupIn(BaseModel):
    password: str = Field(max_length=128)


class ChangeIn(BaseModel):
    current_password: str = Field(max_length=128)
    new_password: str = Field(max_length=128)


class UnlockIn(BaseModel):
    password: str = Field(max_length=128)


def _scope(user: User) -> str:
    return f"secure_folder:{user.id}"


def _enabled(user: User) -> bool:
    return bool(user.secure_folder_hash)


def require_unlock(request: Request, x_secure_token: str | None = Header(None),
                   user: User = Depends(current_user)) -> User:
    if not _enabled(user):
        raise HTTPException(409, "Secure Folder has not been set up")
    if not x_secure_token:
        raise HTTPException(423, "Secure Folder is locked", headers={"X-Secure-Folder": "locked"})
    try:
        claims = decode_scope_token(x_secure_token, _scope(user))
    except jwt.PyJWTError:
        raise HTTPException(423, "Secure Folder is locked", headers={"X-Secure-Folder": "locked"})
    if claims.get("sub") != user.id:
        raise HTTPException(423, "Secure Folder is locked", headers={"X-Secure-Folder": "locked"})
    request.state.secure_unlocked = True
    return user


@router.get("/status")
def status(user: User = Depends(current_user), db: Session = Depends(get_db)):
    n = db.scalar(select(func.count()).select_from(File).where(File.owner_id == user.id, File.is_secure.is_(True),
                                                               File.deleted_at.is_(None))) or 0
    size = db.scalar(select(func.coalesce(func.sum(File.size), 0)).where(File.owner_id == user.id,
                                                                         File.is_secure.is_(True))) or 0
    return {"enabled": _enabled(user), "file_count": n, "size": int(size),
            "created_at": iso(user.secure_folder_created_at)}


@router.post("/setup", status_code=201)
def setup(body: SetupIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if _enabled(user):
        raise HTTPException(409, "Secure Folder is already set up")
    if (p := password_problem(body.password)):
        raise HTTPException(422, p)
    user.secure_folder_hash = hash_password(body.password)
    user.secure_folder_created_at = utcnow()
    db.commit()
    audit(db, "secure_folder.setup", request=request, actor_id=user.id, owner_id=user.id, resource_type="user",
          resource_id=user.id)
    security_event(db, "secure_folder_setup", "informational", "Secure Folder password created", request=request,
                   user_id=user.id)
    return {"ok": True, "enabled": True}


@router.post("/change-password")
def change_password(body: ChangeIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not _enabled(user):
        raise HTTPException(409, "Secure Folder has not been set up")
    if not verify_password(body.current_password, user.secure_folder_hash):
        raise_alert(db, "secure_folder_failure", "medium", "Wrong Secure Folder password",
                    "A Secure Folder password change was attempted with an incorrect current password.",
                    request=request, user_id=user.id, resource=f"user:{user.id}")
        raise HTTPException(400, "Current Secure Folder password is incorrect")
    if (p := password_problem(body.new_password)):
        raise HTTPException(422, p)
    user.secure_folder_hash = hash_password(body.new_password)
    db.commit()
    audit(db, "secure_folder.password_change", request=request, actor_id=user.id, owner_id=user.id,
          resource_type="user", resource_id=user.id)
    return {"ok": True}


@router.post("/unlock", dependencies=[Depends(rate_limit("secure_unlock", 15))])
def unlock(body: UnlockIn, request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    if not _enabled(user):
        raise HTTPException(409, "Secure Folder has not been set up")
    if not verify_password(body.password, user.secure_folder_hash):
        denied(db, request, user_id=user.id, action="secure_folder.unlock_failed", resource_type="user",
               resource_id=user.id, owner_id=user.id, severity="medium",
               description="Incorrect Secure Folder password entered", category="secure_folder_failure", kind="blocked")
        raise_alert(db, "secure_folder_failure", "high", "Failed Secure Folder unlock",
                    "An incorrect password was entered to unlock a Secure Folder.",
                    request=request, user_id=user.id, resource=f"user:{user.id}")
        raise HTTPException(401, "Incorrect password")
    tok, exp = create_scope_token(_scope(user), user.id, minutes=15)
    audit(db, "secure_folder.unlock", request=request, actor_id=user.id, owner_id=user.id, resource_type="user",
          resource_id=user.id)
    return {"unlocked": True, "secure_token": tok, "expires_at": iso(exp)}


@router.post("/lock")
def lock(request: Request, user: User = Depends(current_user), db: Session = Depends(get_db)):
    # Scope tokens are short-lived and stateless; locking is enforced by the client discarding the token.
    audit(db, "secure_folder.lock", request=request, actor_id=user.id, owner_id=user.id, resource_type="user",
          resource_id=user.id)
    return {"ok": True, "locked": True}


@router.get("/files")
def list_secure(request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    rows = db.scalars(select(File).where(File.owner_id == user.id, File.is_secure.is_(True),
                                         File.deleted_at.is_(None)).order_by(File.created_at.desc())).all()
    return {"items": [file_out(f) for f in rows], "total": len(rows)}


@router.post("/upload", status_code=201, dependencies=[Depends(rate_limit("upload", 60))])
async def upload_secure(request: Request, file: UploadFile = UpFile(...), user: User = Depends(require_unlock),
                        db: Session = Depends(get_db)):
    data = await fs.read_limited(file)
    f = fs.store_encrypted(db, user, file.filename or "", data, None, request)
    f.is_secure = True
    db.commit()
    audit(db, "secure_folder.file_add", request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
          resource_id=f.id)
    return file_out(f)


def _secure_file(db, user, file_id) -> File:
    f = db.get(File, file_id)
    if not f or f.owner_id != user.id or not f.is_secure:
        raise HTTPException(404, "File not found in Secure Folder")
    return f


@router.post("/files/{file_id}/add")
def add_file(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f or f.owner_id != user.id:
        raise HTTPException(404, "File not found")
    if f.deleted_at:
        raise HTTPException(409, "Restore the file before moving it into the Secure Folder")
    f.is_secure = True
    db.commit()
    audit(db, "secure_folder.file_add", request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
          resource_id=f.id)
    return file_out(f)


@router.post("/files/{file_id}/remove")
def remove_file(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = _secure_file(db, user, file_id)
    f.is_secure = False
    db.commit()
    audit(db, "secure_folder.file_remove", request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
          resource_id=f.id)
    return file_out(f)


@router.get("/files/{file_id}/download")
def download_secure(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = _secure_file(db, user, file_id)
    data = fs.read_decrypted(db, f, request, user.id)
    fs.record_download(db, f, request, user_id=user.id, share_id=None, action="download")
    return fs.file_response(f, data, inline=False)


@router.get("/files/{file_id}/preview")
def preview_secure(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = _secure_file(db, user, file_id)
    if f.ext not in fs.INLINE_SAFE:
        raise HTTPException(415, "Preview is not available for this file type")
    data = fs.read_decrypted(db, f, request, user.id)
    fs.record_download(db, f, request, user_id=user.id, share_id=None, action="view")
    return fs.file_response(f, data, inline=True)


@router.delete("/files/{file_id}")
def trash_secure(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = _secure_file(db, user, file_id)
    f.deleted_at = utcnow()
    db.commit()
    audit(db, "secure_folder.file_trash", request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
          resource_id=f.id)
    return {"ok": True, "trashed": True}


@router.post("/files/{file_id}/restore")
def restore_secure(file_id: str, request: Request, user: User = Depends(require_unlock), db: Session = Depends(get_db)):
    f = db.get(File, file_id)
    if not f or f.owner_id != user.id or not f.is_secure:
        raise HTTPException(404, "File not found in Secure Folder")
    if not f.deleted_at:
        raise HTTPException(409, "File is not trashed")
    f.deleted_at = None
    db.commit()
    audit(db, "secure_folder.file_restore", request=request, actor_id=user.id, owner_id=user.id, resource_type="file",
          resource_id=f.id)
    return file_out(f)
