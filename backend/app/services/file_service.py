"""Encrypted file lifecycle: encrypt -> store -> retrieve -> decrypt (with integrity verification)."""
import hashlib
import logging
import uuid

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.request import RequestInfo
from app.models import FileVersion, StoredFile
from app.services import audit_service as audit
from app.services import encryption_service as enc
from app.services import key_service, storage_service

log = logging.getLogger("trustshare.files")


def storage_used(db: Session, owner_id) -> int:
    q = (select(func.coalesce(func.sum(FileVersion.encrypted_size), 0))
         .join(StoredFile, StoredFile.id == FileVersion.file_id).where(StoredFile.owner_id == owner_id))
    return int(db.scalar(q) or 0)


def encrypt_and_store(file_id: uuid.UUID, owner_id: uuid.UUID, number: int, data: bytes,
                      created_by: uuid.UUID) -> FileVersion:
    """Encrypt `data` with a brand-new DEK, upload ciphertext, return the (unsaved) FileVersion row."""
    provider = key_service.get_key_provider()
    dek = enc.generate_data_key()
    aad = enc.build_aad(file_id, number)
    blob = enc.encrypt_bytes(data, dek, aad)
    wrapped, kek_version = provider.wrap(dek, aad.decode())
    del dek  # the plaintext key only ever lived in this function's memory

    storage_key = f"{owner_id}/{file_id}/v{number}-{uuid.uuid4().hex}.bin"
    try:
        storage_service.put_object(storage_key, blob)
    except storage_service.StorageError as exc:
        raise HTTPException(502, f"Storage is unavailable: {exc}") from None

    return FileVersion(
        file_id=file_id, version=number, storage_key=storage_key, size_bytes=len(data),
        encrypted_size=len(blob), sha256=hashlib.sha256(data).hexdigest(), wrapped_dek=wrapped,
        kek_version=kek_version, algorithm=enc.ALGORITHM, created_by=created_by,
    )


def read_plaintext(db: Session, file: StoredFile, version_number: int | None, info: RequestInfo, actor=None) -> bytes:
    """Fetch the encrypted object, unwrap its key, decrypt in memory and verify the GCM tag."""
    number = version_number or file.current_version
    ver = db.scalar(select(FileVersion).where(FileVersion.file_id == file.id, FileVersion.version == number))
    if not ver:
        raise HTTPException(404, "Version not found")
    try:
        blob = storage_service.get_object(ver.storage_key)
    except storage_service.StorageError as exc:
        raise HTTPException(502, f"Storage is unavailable: {exc}") from None

    aad = enc.build_aad(file.id, ver.version)
    try:
        dek = key_service.get_key_provider().unwrap(ver.wrapped_dek, ver.kek_version, aad.decode())
        return enc.decrypt_bytes(blob, dek, aad)
    except (enc.DecryptionError, key_service.KeyError_):
        audit.log_security_event(
            audit.EVT_FILE_THREAT, "critical", "File integrity check failed", info, actor,
            f"Encrypted object for file {file.id} v{ver.version} failed authentication (tampered or corrupted)")
        raise HTTPException(500, "This file failed its integrity check and was not delivered.") from None
    except Exception:  # noqa: BLE001 - e.g. KMS outage
        log.exception("Decryption failed for file %s", file.id)
        raise HTTPException(500, "The file could not be decrypted right now.") from None


def delete_objects(file: StoredFile) -> None:
    for v in file.versions:
        storage_service.delete_object(v.storage_key)
