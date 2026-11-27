import uuid

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.deps import get_current_user, get_member
from app.core.request import RequestInfo, get_request_info
from app.models import Folder, StoredFile, User, utcnow
from app.serializers import folder_dict
from app.services import audit_service as audit

router = APIRouter(prefix="/folders", tags=["folders"])


class FolderIn(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    parent_id: uuid.UUID | None = None


class FolderUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    parent_id: uuid.UUID | None = None


def _own(db: Session, user: User, folder_id: uuid.UUID) -> Folder:
    f = db.get(Folder, folder_id)
    if not f or f.owner_id != user.id:
        raise HTTPException(404, "Folder not found")
    return f


def _clean(name: str) -> str:
    name = name.strip().replace("/", "-").replace("\\", "-")
    if not name:
        raise HTTPException(400, "Folder name can't be empty.")
    return name


@router.get("")
def list_folders(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    counts = dict(db.execute(select(StoredFile.folder_id, func.count()).where(
        StoredFile.owner_id == user.id, StoredFile.deleted_at.is_(None), StoredFile.folder_id.is_not(None)
    ).group_by(StoredFile.folder_id)).all())
    folders = db.scalars(select(Folder).where(Folder.owner_id == user.id).order_by(Folder.name)).all()
    return {"items": [folder_dict(f, file_count=counts.get(f.id, 0)) for f in folders]}


@router.post("", status_code=201)
def create_folder(body: FolderIn, user: User = Depends(get_member), db: Session = Depends(get_db),
                  info: RequestInfo = Depends(get_request_info)):
    if body.parent_id:
        _own(db, user, body.parent_id)
    name = _clean(body.name)
    clash = db.scalar(select(Folder).where(Folder.owner_id == user.id, Folder.parent_id == body.parent_id
                                           if body.parent_id else Folder.parent_id.is_(None), Folder.name == name))
    if clash:
        raise HTTPException(409, "A folder with that name already exists here.")
    folder = Folder(owner_id=user.id, parent_id=body.parent_id, name=name)
    db.add(folder)
    db.commit()
    audit.log_audit("folder.create", user, "folder", folder.id, info, {"name": name}, owner_id=user.id)
    return folder_dict(folder, file_count=0)


@router.patch("/{folder_id}")
def update_folder(folder_id: uuid.UUID, body: FolderUpdate, user: User = Depends(get_member),
                  db: Session = Depends(get_db), info: RequestInfo = Depends(get_request_info)):
    folder = _own(db, user, folder_id)
    if body.name is not None:
        folder.name = _clean(body.name)
    if "parent_id" in body.model_fields_set:
        if body.parent_id:
            cursor = _own(db, user, body.parent_id)
            while cursor is not None:  # refuse to move a folder inside itself
                if cursor.id == folder.id:
                    raise HTTPException(400, "You can't move a folder into itself.")
                cursor = db.get(Folder, cursor.parent_id) if cursor.parent_id else None
        folder.parent_id = body.parent_id
    db.commit()
    audit.log_audit("folder.update", user, "folder", folder.id, info, body.model_dump(exclude_unset=True, mode="json"), owner_id=user.id)
    return folder_dict(folder)


@router.delete("/{folder_id}")
def delete_folder(folder_id: uuid.UUID, user: User = Depends(get_member), db: Session = Depends(get_db),
                  info: RequestInfo = Depends(get_request_info)):
    """Deletes the folder and its sub-folders; the files inside move to the trash."""
    folder = _own(db, user, folder_id)
    all_folders = db.scalars(select(Folder).where(Folder.owner_id == user.id)).all()
    ids, frontier = {folder.id}, [folder.id]
    while frontier:
        current = frontier.pop()
        for f in all_folders:
            if f.parent_id == current and f.id not in ids:
                ids.add(f.id)
                frontier.append(f.id)
    db.execute(update(StoredFile).where(StoredFile.folder_id.in_(ids), StoredFile.deleted_at.is_(None))
               .values(deleted_at=utcnow(), folder_id=None))
    db.execute(update(StoredFile).where(StoredFile.folder_id.in_(ids)).values(folder_id=None))
    db.delete(folder)
    db.commit()
    audit.log_audit("folder.delete", user, "folder", folder_id, info, {"name": folder.name}, owner_id=user.id)
    return {"ok": True}
