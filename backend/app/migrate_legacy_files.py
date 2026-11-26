"""Encrypt legacy version-0 file objects without replacing their DB IDs or metadata."""

import argparse
import logging
from uuid import uuid4

from app.auth import SessionLocal
from app.models import StoredFile
from app.routes_files import storage_path
from app.services import storage_service
from app.services.encryption_service import EncryptionConfigurationError, encrypt_file


logger = logging.getLogger("trustshare.file_migration")


def migrate_legacy_files(apply: bool = False) -> dict:
    db = SessionLocal()
    migrated = 0
    failed = 0
    pending = 0
    try:
        legacy_files = db.query(StoredFile).filter(StoredFile.encryption_version == 0).order_by(StoredFile.id.asc()).all()
        pending = len(legacy_files)
        if not apply:
            return {"pending": pending, "migrated": 0, "failed": 0}

        target_backend = storage_service.configured_backend()
        for item in legacy_files:
            old_name = item.stored_name
            old_backend = getattr(item, "storage_backend", "local") or "local"
            old_path = storage_path(old_name) if old_backend == "local" else None
            new_name = f"{uuid4().hex}.upload"
            new_path = storage_path(new_name) if target_backend == "local" else None
            try:
                original = storage_service.get_object(old_name, old_backend, old_path)
                if len(original) != int(item.size_bytes or 0):
                    raise ValueError("Legacy file size does not match its metadata.")
                encrypted, wrapped_key, key_id = encrypt_file(original)
                storage_service.put_object(new_name, encrypted, target_backend, new_path)

                item.stored_name = new_name
                item.storage_backend = target_backend
                item.encryption_version = 1
                item.wrapped_data_key = wrapped_key
                item.encryption_key_id = key_id
                db.commit()
                try:
                    storage_service.delete_object(old_name, old_backend, old_path)
                except Exception:
                    logger.exception("Encrypted legacy object committed but plaintext cleanup failed for file_id=%s", item.id)
                    failed += 1
                    continue
                migrated += 1
            except Exception:
                db.rollback()
                try:
                    storage_service.delete_object(new_name, target_backend, new_path)
                except Exception:
                    logger.exception("Could not clean an uncommitted migration object for file_id=%s", item.id)
                logger.exception("Legacy file encryption failed for file_id=%s", item.id)
                failed += 1
        return {"pending": pending, "migrated": migrated, "failed": failed}
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Encrypt legacy files and update their existing metadata rows.")
    args = parser.parse_args()
    try:
        result = migrate_legacy_files(apply=args.apply)
    except EncryptionConfigurationError as exc:
        parser.error(str(exc))
    print(f"Legacy file migration: pending={result['pending']} migrated={result['migrated']} failed={result['failed']}")
    if not args.apply:
        print("Dry run only. Use --apply after backing up the encryption key and database.")


if __name__ == "__main__":
    main()
