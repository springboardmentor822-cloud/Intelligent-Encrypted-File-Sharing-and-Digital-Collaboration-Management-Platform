import base64
import logging
from typing import Dict, Any, List
from sqlalchemy.orm import Session
from app.db.session import SessionLocal
from app.models.file import FileRecord
from app.services.encryption_service import EncryptionService

logger = logging.getLogger(__name__)


class KeyRotationService:
    """
    Milestone 2 Task 7: Cryptographic Key Management & Rotation Service.
    Implements Master Key (KEK) rotation via Envelope Encryption:
    Re-wraps all per-file Data Encryption Keys (DEKs) under a new Master KEK
    WITHOUT downloading or re-encrypting large file payloads in S3.
    """

    @classmethod
    def _parse_key_bytes(cls, key_str: str) -> bytes:
        """Parses a hex or base64 key into 32 raw bytes."""
        if len(key_str) == 64:
            return bytes.fromhex(key_str)
        decoded = base64.b64decode(key_str)
        if len(decoded) != 32:
            raise ValueError(f"Key must be exactly 32 bytes (256 bits). Received {len(decoded)} bytes.")
        return decoded

    @classmethod
    def rotate_master_key(
        cls,
        current_master_key_b64: str,
        new_master_key_b64: str,
    ) -> Dict[str, Any]:
        """
        Re-encrypts all stored encrypted DEKs with the new Master KEK.
        """
        old_kek = cls._parse_key_bytes(current_master_key_b64)
        new_kek = cls._parse_key_bytes(new_master_key_b64)

        success_count = 0
        failure_count = 0
        failed_file_ids: List[int] = []

        with SessionLocal() as db:
            files = db.query(FileRecord).filter(FileRecord.encrypted_dek.isnot(None)).all()
            for f in files:
                try:
                    if not f.encrypted_dek or not f.dek_nonce:
                        continue
                    # 1. Unwrap DEK using the old KEK
                    dek = EncryptionService.unwrap_dek(f.encrypted_dek, f.dek_nonce, master_key=old_kek)
                    
                    # 2. Re-wrap DEK using the new KEK
                    new_wrapped_dek, new_dek_nonce = EncryptionService.wrap_dek(dek, master_key=new_kek)
                    
                    # 3. Update database record
                    f.encrypted_dek = new_wrapped_dek
                    f.dek_nonce = new_dek_nonce
                    success_count += 1
                except Exception as e:
                    logger.error(f"Failed to rotate key for file {f.id} ('{f.original_filename}'): {e}")
                    failure_count += 1
                    failed_file_ids.append(f.id)

            if success_count > 0:
                db.commit()

        return {
            "status": "success" if failure_count == 0 else "partial_success",
            "total_files_evaluated": success_count + failure_count,
            "successfully_rewrapped": success_count,
            "failures": failure_count,
            "failed_file_ids": failed_file_ids,
            "message": f"Successfully re-wrapped {success_count} file DEKs under new Master KEK."
        }
