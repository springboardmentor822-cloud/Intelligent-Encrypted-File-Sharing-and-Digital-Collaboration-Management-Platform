from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.deps import get_current_user, require_roles
from app.db.postgres import get_db
from app.models.postgres import Folder, StoredFile, User
from app.schemas.files import FolderIn, FolderOut
from app.services.audit import log_event

router = APIRouter(prefix="/folders", tags=["Folders"])


@router.post("", response_model=FolderOut, status_code=201)
async def create_folder(body: FolderIn, request: Request, user: User = Depends(require_roles("user", "admin")),
                        db: AsyncSession = Depends(get_db)):
    if body.parent_id:
        parent = await db.get(Folder, body.parent_id)
        if not parent or parent.owner_id != user.id:
            raise HTTPException(404, "Parent folder not found")
    folder = Folder(owner_id=user.id, parent_id=body.parent_id, name=body.name.strip())
    db.add(folder)
    await db.commit()
    await log_event("folder_create", request, user=user, resource_type="folder", resource_id=folder.id)
    return folder


@router.get("", response_model=list[FolderOut])
async def list_folders(parent_id: str | None = None, user: User = Depends(get_current_user),
                       db: AsyncSession = Depends(get_db)):
    q = select(Folder).where(Folder.owner_id == user.id)
    q = q.where(Folder.parent_id == parent_id) if parent_id else q.where(Folder.parent_id.is_(None))
    return (await db.execute(q.order_by(Folder.name))).scalars().all()


@router.get("/{folder_id}/path", response_model=list[FolderOut])
async def folder_path(folder_id: str, user: User = Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """Breadcrumb: all ancestors of a folder, from the top down."""
    path: list[Folder] = []
    current = await db.get(Folder, folder_id)
    while current and current.owner_id == user.id and len(path) < 20:
        path.insert(0, current)
        current = await db.get(Folder, current.parent_id) if current.parent_id else None
    if not path:
        raise HTTPException(404, "Folder not found")
    return path


@router.delete("/{folder_id}")
async def delete_folder(folder_id: str, request: Request, user: User = Depends(get_current_user),
                        db: AsyncSession = Depends(get_db)):
    folder = await db.get(Folder, folder_id)
    if not folder or folder.owner_id != user.id:
        raise HTTPException(404, "Folder not found")
    has_files = (await db.execute(select(func.count()).select_from(StoredFile).where(StoredFile.folder_id == folder_id, StoredFile.deleted_at.is_(None)))).scalar()
    has_sub = (await db.execute(select(func.count()).select_from(Folder).where(Folder.parent_id == folder_id))).scalar()
    if has_files or has_sub:
        raise HTTPException(409, "Folder is not empty. Move or delete its contents first.")
    await db.delete(folder)
    await db.commit()
    await log_event("folder_delete", request, user=user, resource_type="folder", resource_id=folder_id)
    return {"message": "Folder deleted"}
