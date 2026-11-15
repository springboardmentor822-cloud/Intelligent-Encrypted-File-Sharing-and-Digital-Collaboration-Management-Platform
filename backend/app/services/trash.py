"""Trash: files moved to the Trash stay (encrypted) for TRASH_RETENTION_DAYS, then are deleted for good."""
import logging
from datetime import timedelta

from sqlalchemy import select

from app.core.config import settings
from app.core.storage import get_storage
from app.db.mongo import mongo_db
from app.db.postgres import SessionLocal
from app.models.postgres import StoredFile, utcnow

logger = logging.getLogger("trustshare.trash")


async def purge_file(db, f: StoredFile) -> None:
    """Permanently remove one file: the encrypted object, the database row and the metadata document."""
    await get_storage().delete(f.storage_key)
    file_id = f.id
    await db.delete(f)
    await db.commit()
    await mongo_db.file_metadata.delete_one({"file_id": file_id})


async def purge_expired_trash() -> int:
    """Called by the hourly background loop. Returns how many files were removed."""
    cutoff = utcnow() - timedelta(days=settings.TRASH_RETENTION_DAYS)
    removed = 0
    async with SessionLocal() as db:
        old = (await db.execute(
            select(StoredFile).where(StoredFile.deleted_at.is_not(None), StoredFile.deleted_at <= cutoff)
        )).scalars().all()
        for f in old:
            await purge_file(db, f)
            removed += 1
    if removed:
        logger.info("Trash purge: %s file(s) permanently deleted", removed)
    return removed
