"""Rewrap stored file data keys after adding a new active key-encryption key."""

import argparse

from app.auth import SessionLocal
from app.models import StoredFile
from app.services.encryption_service import _keyring, rewrap_data_key


def rotate_file_keys(apply: bool = False) -> dict:
    active_id, _ = _keyring()
    db = SessionLocal()
    changed = 0
    try:
        files = db.query(StoredFile).filter(StoredFile.encryption_version == 1).all()
        pending = [item for item in files if (item.encryption_key_id or "default") != active_id]
        if not apply:
            return {"active_key_id": active_id, "pending": len(pending), "rewrapped": 0}
        for item in pending:
            new_wrapped_key, new_key_id = rewrap_data_key(item.wrapped_data_key, item.encryption_key_id)
            item.wrapped_data_key = new_wrapped_key
            item.encryption_key_id = new_key_id
            try:
                db.commit()
            except Exception:
                db.rollback()
                raise
            changed += 1
        return {"active_key_id": active_id, "pending": len(pending), "rewrapped": changed}
    finally:
        db.close()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--apply", action="store_true", help="Rewrap data keys with the active configured KEK.")
    args = parser.parse_args()
    result = rotate_file_keys(args.apply)
    print(f"File key rotation: active_key_id={result['active_key_id']} pending={result['pending']} rewrapped={result['rewrapped']}")
    if not args.apply:
        print("Dry run only. Keep prior keys configured until rotation completes.")


if __name__ == "__main__":
    main()
