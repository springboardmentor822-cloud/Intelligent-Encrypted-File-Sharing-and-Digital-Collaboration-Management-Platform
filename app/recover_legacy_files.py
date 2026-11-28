
import argparse
import uuid
from pathlib import Path

from app.database import SessionLocal
from app.models import File, User
from app.services.encryption_service import EncryptionService
from app.services.storage_service import StorageService


BACKUP_DIR = Path("/app/recovery_backup")

RECOVERY_FILES = {
    5: "f0b24a23cb31444ca951c986cac819c3.pdf",
    6: "6e1be75c780c4b22a760997f9d3531b5.pdf",
    7: "365f9c1f57b64a99a14efc614a19fc64.png",
}

EXPECTED_OWNER = "user1@example.com"


def recover_file(db, file_id, backup_name, apply=False):
    record = db.query(File).filter(File.id == file_id).first()

    if not record:
        raise RuntimeError(f"File ID {file_id} not found")

    owner = db.query(User).filter(
        User.id == record.owner_id
    ).first()

    if not owner or owner.email != EXPECTED_OWNER:
        raise RuntimeError(f"Owner mismatch for file ID {file_id}")

    if record.encryption_nonce and record.wrapped_key and record.key_nonce:
        print(f"SKIP ID {file_id}: Metadata already complete")
        return

    if any([
        record.encryption_nonce,
        record.wrapped_key,
        record.key_nonce,
    ]):
        raise RuntimeError(f"Partial metadata found for ID {file_id}")

    backup_path = BACKUP_DIR / backup_name

    if not backup_path.is_file():
        raise RuntimeError(f"Backup missing: {backup_name}")

    content = backup_path.read_bytes()

    if len(content) != record.size:
        raise RuntimeError(f"Size mismatch for ID {file_id}")

    print(f"\nChecking ID {file_id}: {record.filename}")

    encrypted = EncryptionService.encrypt_and_wrap(content)

    # Verify encryption and decryption before storage
    decrypted = EncryptionService.unwrap_and_decrypt(
        encrypted["encrypted_data"],
        encrypted["nonce"],
        encrypted["wrapped_key"],
        encrypted["key_nonce"],
        encrypted["key_version"],
    )

    if decrypted != content:
        raise RuntimeError(f"Encryption verification failed: ID {file_id}")

    print("Encryption/decryption verification: PASSED")
    print("Key version:", encrypted["key_version"])

    if not apply:
        print("DRY RUN: No database or storage changes made.")
        return

    # Use a new object key; never overwrite the old file
    extension = Path(record.filename).suffix.lower()
    object_key = (
        f"users/{record.owner_id}/recovered/"
        f"{uuid.uuid4().hex}{extension}"
    )

    StorageService.ensure_bucket()

    StorageService.upload_file(
        object_key,
        encrypted["encrypted_data"],
    )

    # Verify actual RustFS object
    stored_data = StorageService.download_file(object_key)

    verified_content = EncryptionService.unwrap_and_decrypt(
        stored_data,
        encrypted["nonce"],
        encrypted["wrapped_key"],
        encrypted["key_nonce"],
        encrypted["key_version"],
    )

    if verified_content != content:
        raise RuntimeError(
            f"RustFS verification failed for ID {file_id}. "
            "Database was not updated."
        )

    # Update existing row; preserve ID, owner, filename and shares
    record.storage_path = f"rustfs://{object_key}"
    record.encryption_nonce = encrypted["nonce"]
    record.wrapped_key = encrypted["wrapped_key"]
    record.key_nonce = encrypted["key_nonce"]
    record.key_version = encrypted["key_version"]

    db.commit()

    print(f"RECOVERED ID {file_id}: {record.filename}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Apply recovery after successful dry run",
    )
    args = parser.parse_args()

    db = SessionLocal()

    try:
        print("MODE:", "APPLY" if args.apply else "DRY RUN")

        for file_id, backup_name in RECOVERY_FILES.items():
            recover_file(
                db,
                file_id,
                backup_name,
                apply=args.apply,
            )

        print("\nRecovery process completed.")

    except Exception:
        db.rollback()
        raise

    finally:
        db.close()


if __name__ == "__main__":
    main()
