
import os
import logging
import mimetypes
import re
import secrets
import zipfile
from datetime import date as Date, datetime, time, timedelta, timezone
from pathlib import Path
from urllib.parse import quote
from uuid import uuid4

from fastapi import (
    APIRouter,
    Depends,
    File,
    Form,
    Header,
    HTTPException,
    Query,
    UploadFile,
)
from fastapi.responses import FileResponse, Response
from starlette.background import BackgroundTask
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.activity import create_notification, record_activity
from app.auth import get_db, require_roles
from app.database import mongo_db
from app.gmail_service import GmailDeliveryUncertain, gmail_status, send_gmail_message
from app.models import Favorite, FileShare, Folder, FolderShare, StoredFile, User
from app.platform_settings import get_platform_settings
from app.routes_folders import (
    folder_share_is_active,
    get_active_folder_share,
    get_owned_folder,
    hash_folder_password,
    require_folder_unlock,
)
from app.schemas import (
    FileDownloadRequest,
    FileShareRequest,
    FileShareUpdateRequest,
    StoredFileResponse,
)
from app.services.encryption_service import (
    EncryptionConfigurationError,
    FileEncryptionError,
    decrypt_file,
    encrypt_file,
)
from app.services import storage_service


router = APIRouter(prefix="/files", tags=["Files"])


def download_activity_task(
    user_id: int,
    item: StoredFile,
    username: str | None = None,
) -> BackgroundTask:
    """Record a download only after Starlette has sent the file response."""
    return BackgroundTask(
        record_file_download,
        user_id,
        item,
        secrets.token_urlsafe(18),
        username,
    )


def record_file_download(
    user_id: int,
    item: StoredFile,
    event_id: str,
    username: str | None = None,
) -> None:
    record_activity(
        "file_download_success",
        user_id,
        **({"username": username} if username else {}),
        file_id=item.id,
        resource_owner_id=item.owner_id,
        shared_download=user_id != item.owner_id,
    )
    if user_id != item.owner_id:
        create_notification(
            item.owner_id,
            "Shared file downloaded",
            "A recipient downloaded a file you shared.",
            "shared_file_download",
            dedupe_key=f"shared_file_download:{item.id}:{event_id}",
        )


def record_file_download_failure(
    user_id: int,
    item: StoredFile,
    category: str,
    username: str | None = None,
) -> None:
    record_activity(
        "file_download_failed",
        user_id,
        **({"username": username} if username else {}),
        file_id=item.id,
        resource_owner_id=item.owner_id,
        shared_download=user_id != item.owner_id,
        details=f"File download failed: {category}.",
        status="failed",
        severity="warning",
    )
file_logger = logging.getLogger("trustshare.files")

UPLOAD_DIR = Path(__file__).resolve().parents[1] / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

MAX_FILE_SIZE = int(
    os.getenv("MAX_UPLOAD_SIZE_BYTES", str(100 * 1024 * 1024))
)

USER_STORAGE_QUOTA_BYTES = int(
    os.getenv(
        "USER_STORAGE_QUOTA_BYTES",
        str(4 * 1024 * 1024 * 1024),
    )
)

ALLOWED_FILE_EXTENSIONS = frozenset(
    extension.strip().lower()
    for extension in os.getenv(
        "ALLOWED_FILE_EXTENSIONS",
        ".pdf,.doc,.docx,.txt,.ppt,.pptx,.xls,.xlsx,.csv,"
        ".png,.jpg,.jpeg,.gif,.webp,.svg,.zip",
    ).split(",")
    if extension.strip()
)

SAFE_PREVIEW_CONTENT_TYPES = {
    ".pdf": "application/pdf",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ".ppt": "application/vnd.ms-powerpoint",
}


def storage_path(stored_name: str) -> Path:
    base_path = UPLOAD_DIR.resolve()
    candidate = (base_path / stored_name).resolve()

    if candidate.parent != base_path:
        raise HTTPException(
            status_code=404,
            detail="Stored file is missing.",
        )

    return candidate


def validate_file_content(file: UploadFile, extension: str) -> None:
    file.file.seek(0)
    header = file.file.read(4096)
    file.file.seek(0)

    if not header:
        raise HTTPException(
            status_code=400,
            detail="Empty files are not allowed.",
        )

    signatures = {
        ".pdf": header.startswith(b"%PDF-"),
        ".png": header.startswith(b"\x89PNG\r\n\x1a\n"),
        ".jpg": header.startswith(b"\xff\xd8\xff"),
        ".jpeg": header.startswith(b"\xff\xd8\xff"),
        ".gif": header.startswith((b"GIF87a", b"GIF89a")),
        ".webp": (
            len(header) >= 12
            and header[:4] == b"RIFF"
            and header[8:12] == b"WEBP"
        ),
        ".doc": header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".xls": header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
        ".ppt": header.startswith(b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"),
    }

    if extension in (".docx", ".xlsx", ".pptx", ".zip"):
        file.file.seek(0)
        valid = zipfile.is_zipfile(file.file)
        file.file.seek(0)
    elif extension in (".txt", ".csv", ".svg"):
        try:
            header.decode("utf-8")
            valid = b"\x00" not in header
        except UnicodeDecodeError:
            valid = False
    else:
        valid = signatures.get(extension, False)

    if not valid:
        raise HTTPException(
            status_code=415,
            detail="The file content does not match its allowed file type.",
        )


def file_metadata(stored_file: StoredFile) -> dict:
    preview_content_type = get_preview_content_type(stored_file)
    return {
        "id": stored_file.id,
        "original_name": stored_file.original_name,
        "content_type": stored_file.content_type,
        "is_previewable": preview_content_type is not None,
        "size_bytes": stored_file.size_bytes,
        "created_at": stored_file.created_at,
        "folder_id": getattr(stored_file, "folder_id", None),
        "is_password_protected": bool(getattr(stored_file, "password_hash", None)),
        "is_parent_folder_password_protected": False,
        "is_encrypted_at_rest": int(getattr(stored_file, "encryption_version", 0) or 0) > 0,
    }


def get_preview_content_type(stored_file: StoredFile) -> str | None:
    extension = Path(stored_file.original_name or "").suffix.lower()
    return SAFE_PREVIEW_CONTENT_TYPES.get(extension)


def require_preview_content_type(stored_file: StoredFile) -> str:
    content_type = get_preview_content_type(stored_file)
    if content_type is None:
        raise HTTPException(
            status_code=415,
            detail="This file type cannot be previewed in TrustShare.",
        )
    return content_type


def get_used_storage(user_id: int, db: Session) -> int:
    records = db.query(StoredFile).filter(StoredFile.owner_id == user_id).all()
    used = 0
    for record in records:
        backend = getattr(record, "storage_backend", "local") or "local"
        path = storage_path(record.stored_name) if backend == "local" else None
        try:
            actual_size = storage_service.object_length(record.stored_name, backend, path)
        except HTTPException as exc:
            raise HTTPException(status_code=503, detail=f"Storage accounting is unavailable: stored file {record.id} is missing or unreadable.") from exc
        logical_size = int(record.size_bytes or 0)
        encryption_version = int(getattr(record, "encryption_version", 0) or 0)
        size_mismatch = actual_size != logical_size if encryption_version == 0 else actual_size < logical_size + 36
        if record.size_bytes is None or size_mismatch:
            raise HTTPException(
                status_code=503,
                detail=f"Storage accounting is unavailable: file size metadata for file {record.id} does not match its stored object.",
            )
        used += logical_size
    return used


def file_share_is_active(share: FileShare, now: datetime | None = None) -> bool:
    if share.revoked:
        return False
    expires_at = getattr(share, "expires_at", None)
    if expires_at is None:
        return True
    now = now or datetime.now(timezone.utc)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    return expires_at > now


def record_share_access_denial(share: FileShare | None, user: User, share_token: str, *, permission: str) -> None:
    if share is None or share.permission != permission:
        event_type = "unauthorized_access"
        detail = "Invalid shared-file access attempt."
    elif share.revoked:
        event_type = "revoked_link_access"
        detail = "Revoked shared-file link access attempt."
    elif not file_share_is_active(share):
        event_type = "expired_link_access"
        detail = "Expired shared-file link access attempt."
    else:
        event_type = "unauthorized_access"
        detail = "Shared-file access was denied."
    record_activity(
        event_type,
        user.id, username=getattr(user, "full_name", None),
        target_name="shared link",
        details=detail,
        status="failed",
        severity="warning",
    )
    if share is not None and event_type in {"expired_link_access", "revoked_link_access"}:
        create_notification(
            share.owner_id,
            "Shared link access blocked",
            f"An attempt to access a {event_type.split('_')[0]} shared link was blocked.",
            "share_access_denied",
            dedupe_key=f"share_access_denied:{share.id}:{secrets.token_urlsafe(18)}",
        )


def file_download_response(
    item: StoredFile,
    requester_id: int,
    inline: bool = False,
    preview_media_type: str | None = None,
    requester_username: str | None = None,
) -> Response:
    """Retrieve an object and return plaintext only after its envelope is verified."""
    try:
        backend = getattr(item, "storage_backend", "local") or "local"
        path = storage_path(item.stored_name) if backend == "local" else None
        blob = storage_service.get_object(item.stored_name, backend, path)
    except Exception:
        if not inline:
            record_file_download_failure(requester_id, item, "storage_retrieval", requester_username)
        raise
    has_encryption_metadata = hasattr(item, "encryption_version")
    version = int(getattr(item, "encryption_version", 0) or 0)
    if version == 0 and backend == "local" and not inline:
        if has_encryption_metadata and os.getenv("ALLOW_LEGACY_PLAINTEXT_DOWNLOADS", "false").lower() != "true":
            record_file_download_failure(requester_id, item, "legacy_storage_migration_required", requester_username)
            raise HTTPException(
                status_code=409,
                detail="This legacy file must be migrated to encrypted storage before it can be downloaded.",
            )
        return FileResponse(
            path=str(path), filename=item.original_name, media_type=item.content_type,
            background=download_activity_task(requester_id, item, requester_username),
        )
    if version == 0:
        if has_encryption_metadata and os.getenv("ALLOW_LEGACY_PLAINTEXT_DOWNLOADS", "false").lower() != "true":
            if not inline:
                record_file_download_failure(requester_id, item, "legacy_storage_migration_required", requester_username)
            raise HTTPException(
                status_code=409,
                detail="This legacy file must be migrated to encrypted storage before it can be downloaded.",
            )
        plaintext = blob  # Legacy cloud objects are retained for backward compatibility.
    elif version == 1:
        try:
            plaintext = decrypt_file(blob, item.wrapped_data_key, item.encryption_key_id)
        except EncryptionConfigurationError as exc:
            if not inline:
                record_file_download_failure(requester_id, item, "decryption_key_unavailable", requester_username)
            file_logger.error("File decryption key unavailable for file_id=%s", item.id)
            raise HTTPException(status_code=503, detail="The file encryption key is not available.") from exc
        except FileEncryptionError as exc:
            if not inline:
                record_file_download_failure(requester_id, item, "integrity_verification", requester_username)
            file_logger.warning("File integrity verification failed for file_id=%s", item.id)
            raise HTTPException(status_code=500, detail="The stored file failed integrity verification.") from exc
    else:
        if not inline:
            record_file_download_failure(requester_id, item, "unsupported_encryption_version", requester_username)
        raise HTTPException(status_code=500, detail="The stored file uses an unsupported encryption version.")
    safe_filename = quote(Path(item.original_name).name, safe="")
    disposition = "inline" if inline else "attachment"
    if inline and preview_media_type is not None:
        media_type = preview_media_type
    elif inline and item.content_type not in {"application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "text/plain"}:
        media_type = "application/octet-stream"
    else:
        media_type = item.content_type
    return Response(
        content=plaintext,
        media_type=media_type,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{safe_filename}",
            "X-Content-Type-Options": "nosniff",
            **({"Content-Security-Policy": "sandbox"} if inline else {}),
        },
        background=(
            BackgroundTask(record_activity, "file_preview_success", requester_id, **({"username": requester_username} if requester_username else {}), file_id=item.id, resource_owner_id=item.owner_id)
            if inline else download_activity_task(requester_id, item, requester_username)
        ),
    )


def check_download_passwords(
    item: StoredFile,
    user: User,
    db: Session,
    password: str | None,
    folder_unlock_token: str | None = None,
    *,
    folder_password: str | None = None,
) -> None:
    try:
        check_parent_folder_password(
            item,
            user,
            db,
            folder_password,
            folder_unlock_token,
        )
        check_file_password(item, password)
    except HTTPException as exc:
        if exc.status_code == 403 and exc.detail in {
            "A correct folder password is required.",
            "A correct file password is required.",
        }:
            category = (
                "folder_password_validation"
                if "folder" in str(exc.detail)
                else "file_password_validation"
            )
            record_file_download_failure(user.id, item, category, getattr(user, "full_name", None))
        raise


def get_owned_file(file_id: int, user: User, db: Session) -> StoredFile:
    stored_file = (
        db.query(StoredFile)
        .filter(
            StoredFile.id == file_id,
            StoredFile.owner_id == user.id,
        )
        .first()
    )

    if stored_file is None:
        record_activity(
            "unauthorized_access",
            user.id, username=getattr(user, "full_name", None),
            file_id=file_id,
            details="File access denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="File not found.")

    folder_id = getattr(stored_file, "folder_id", None)
    if folder_id is not None:
        folder = (
            db.query(Folder)
            .filter(
                Folder.id == folder_id,
                Folder.owner_id == user.id,
            )
            .first()
        )

        if folder is None:
            record_activity(
                "unauthorized_access",
                user.id, username=getattr(user, "full_name", None),
                file_id=file_id,
                folder_id=folder_id,
                details="File access denied",
                severity="warning",
            )
            raise HTTPException(status_code=404, detail="File not found.")

    return stored_file


def get_readable_file(file_id: int, user: User, db: Session) -> tuple[StoredFile, bool]:
    stored_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if stored_file is None:
        record_activity(
            "unauthorized_access",
            user.id, username=getattr(user, "full_name", None),
            file_id=file_id,
            details="File access denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="File not found.")
    if stored_file.owner_id == user.id:
        return get_owned_file(file_id, user, db), False
    user_email = getattr(user, "email", None)
    direct_share = db.query(FileShare).filter(
        FileShare.file_id == stored_file.id,
        FileShare.owner_id == stored_file.owner_id,
        FileShare.recipient_email == user_email,
        FileShare.permission == "download",
        FileShare.revoked == False,
    ).first() if user_email else None
    if direct_share is not None and not file_share_is_active(direct_share):
        direct_share = None
    folder_id = getattr(stored_file, "folder_id", None)
    folder_share = (
        get_active_folder_share(folder_id, user, db)
        if folder_id is not None
        else None
    )
    if folder_share is not None and folder_share.owner_id != stored_file.owner_id:
        folder_share = None
    if direct_share is None and folder_share is None:
        record_activity(
            "unauthorized_access",
            user.id, username=getattr(user, "full_name", None),
            file_id=file_id,
            resource_owner_id=stored_file.owner_id,
            details="File access denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="File not found.")
    return stored_file, True


def get_writable_file(file_id: int, user: User, db: Session) -> tuple[StoredFile, bool]:
    stored_file = db.query(StoredFile).filter(StoredFile.id == file_id).first()
    if stored_file is None:
        record_activity(
            "unauthorized_access",
            user.id, username=getattr(user, "full_name", None),
            file_id=file_id,
            details="File access denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="File not found.")
    if stored_file.owner_id == user.id:
        return get_owned_file(file_id, user, db), False
    folder_id = getattr(stored_file, "folder_id", None)
    share = get_active_folder_share(folder_id, user, db) if folder_id is not None else None
    if share is None or share.owner_id != stored_file.owner_id or share.permission != "editor":
        record_activity(
            "unauthorized_access",
            user.id, username=getattr(user, "full_name", None),
            file_id=file_id,
            resource_owner_id=stored_file.owner_id,
            details="File modification denied",
            severity="warning",
        )
        raise HTTPException(status_code=404, detail="File not found.")
    return stored_file, True


def check_file_password(
    stored_file: StoredFile,
    password: str | None,
) -> None:
    password_hash = getattr(stored_file, "password_hash", None)
    if not password_hash:
        return

    from app.routes_folders import verify_folder_password

    if password is None or not verify_folder_password(
        password, password_hash
    ):
        raise HTTPException(
            status_code=403,
            detail="A correct file password is required.",
        )


def check_parent_folder_password(
    stored_file: StoredFile,
    user: User,
    db: Session,
    password: str | None,
    unlock_token: str | None = None,
) -> None:
    folder_id = getattr(stored_file, "folder_id", None)
    if folder_id is None:
        return

    folder = db.query(Folder).filter(
        Folder.id == folder_id,
        Folder.owner_id == stored_file.owner_id,
    ).first()
    if folder is None:
        raise HTTPException(status_code=404, detail="File not found.")
    if folder.owner_id != user.id:
        folder_share = get_active_folder_share(folder_id, user, db)
        direct_share = db.query(FileShare).filter(
            FileShare.file_id == stored_file.id,
            FileShare.owner_id == stored_file.owner_id,
            FileShare.recipient_email == getattr(user, "email", None),
            FileShare.revoked == 0,
        ).first()
        if direct_share is not None and not file_share_is_active(direct_share):
            direct_share = None
        if direct_share is not None and direct_share.permission not in {"view", "download"}:
            direct_share = None
        if (folder_share is None or folder_share.owner_id != folder.owner_id) and direct_share is None:
            raise HTTPException(status_code=404, detail="File not found.")
    require_folder_unlock(folder, user, password, unlock_token)


@router.post(
    "/upload",
    response_model=StoredFileResponse,
    status_code=201,
)
def upload_file(
    file: UploadFile = File(...),
    password: str | None = Form(default=None),
    current_user: User = Depends(require_roles("admin", "user")),
    folder_id: int | None = Query(default=None),
    folder_password: str | None = Query(default=None),
    folder_unlock_token: str | None = Header(default=None, alias="X-Folder-Unlock-Token"),
    db: Session = Depends(get_db),
):
    platform_settings = get_platform_settings(db)
    max_file_size = platform_settings["max_upload_size_bytes"]
    storage_quota = platform_settings["per_user_storage_quota_bytes"]
    allowed_extensions = frozenset(platform_settings["allowed_file_extensions"])

    if not isinstance(password, str):
        password = None

    if password is not None and not password.strip():
        raise HTTPException(
            status_code=400,
            detail="File password cannot be blank.",
        )

    if password is not None and not 8 <= len(password) <= 128:
        raise HTTPException(
            status_code=400,
            detail="File password must contain 8 to 128 characters.",
        )

    if folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if folder is None:
            raise HTTPException(status_code=404, detail="Folder not found.")
        if folder.owner_id == current_user.id:
            require_folder_unlock(folder, current_user, folder_password, folder_unlock_token)
            folder_owner_id = current_user.id
        else:
            folder_permission = get_active_folder_share(folder.id, current_user, db)
            if folder_permission is None or folder_permission.owner_id != folder.owner_id or folder_permission.permission != "editor":
                raise HTTPException(status_code=404, detail="Folder not found.")
            require_folder_unlock(folder, current_user, folder_password, folder_unlock_token)
            folder_owner_id = folder.owner_id
    else:
        folder_owner_id = current_user.id

    used_storage = get_used_storage(folder_owner_id, db)

    if used_storage >= storage_quota:
        raise HTTPException(
            status_code=413,
            detail="Your storage quota is full.",
        )

    original_name = Path(file.filename or "uploaded_file").name.strip()
    original_name = "".join(
        character for character in original_name
        if character.isprintable()
    )

    if not original_name or original_name in (".", ".."):
        raise HTTPException(status_code=400, detail="Invalid filename.")

    original_name = original_name[:255]
    extension = Path(original_name).suffix.lower()

    if extension not in allowed_extensions:
        raise HTTPException(
            status_code=415,
            detail=(
                "This file type is not allowed. Allowed extensions: "
                + ", ".join(sorted(allowed_extensions))
            ),
        )

    validate_file_content(file, extension)

    stored_name = f"{uuid4().hex}.upload"
    storage_backend = "local"
    object_saved = False
    total_size = 0

    try:
        plaintext = file.file.read(max_file_size + 1)
        total_size = len(plaintext)
        if total_size > max_file_size:
            raise HTTPException(status_code=413, detail=("File is too large. Maximum size is " f"{max_file_size // (1024 * 1024)} MB."))
        if used_storage + total_size > storage_quota:
            raise HTTPException(status_code=413, detail="This upload exceeds your remaining storage.")

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Empty files are not allowed.",
            )

        try:
            encrypted_blob, wrapped_data_key, encryption_key_id = encrypt_file(plaintext)
        except EncryptionConfigurationError as exc:
            raise HTTPException(status_code=503, detail="Encrypted file storage is not configured. Contact the administrator.") from exc
        storage_backend = storage_service.configured_backend()
        local_path = storage_path(stored_name) if storage_backend == "local" else None
        storage_service.put_object(stored_name, encrypted_blob, storage_backend, local_path)
        object_saved = True

        stored_file = StoredFile(
            original_name=original_name,
            stored_name=stored_name,
            content_type=(
                mimetypes.guess_type(original_name)[0]
                or "application/octet-stream"
            )[:255],
            size_bytes=total_size,
            owner_id=folder_owner_id,
            folder_id=folder_id,
            password_hash=(
                hash_folder_password(password)
                if password is not None
                else None
            ),
            encryption_version=1,
            wrapped_data_key=wrapped_data_key,
            encryption_key_id=encryption_key_id,
            storage_backend=storage_backend,
        )

        db.add(stored_file)
        db.commit()
        db.refresh(stored_file)

        record_activity(
            "file_upload_success",
            current_user.id, username=getattr(current_user, "full_name", None),
            file_id=stored_file.id,
        )

        return file_metadata(stored_file)

    except HTTPException:
        db.rollback()
        if object_saved:
            try:
                storage_service.delete_object(stored_name, storage_backend, storage_path(stored_name) if storage_backend == "local" else None)
            except Exception:
                file_logger.exception("Upload cleanup failed for uncommitted object.")
        raise
    except Exception:
        db.rollback()
        if object_saved:
            try:
                storage_service.delete_object(stored_name, storage_backend, storage_path(stored_name) if storage_backend == "local" else None)
            except Exception:
                file_logger.exception("Upload cleanup failed for uncommitted object.")
        file_logger.exception("Unable to save uploaded file.")
        raise HTTPException(
            status_code=500,
            detail="Unable to save the file.",
        )
    finally:
        file.file.close()


@router.get("/storage")
def get_storage_summary(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    used = get_used_storage(current_user.id, db)
    platform_settings = get_platform_settings(db)
    quota = platform_settings["per_user_storage_quota_bytes"]

    records = db.query(StoredFile).filter(StoredFile.owner_id == current_user.id).order_by(StoredFile.size_bytes.desc(), StoredFile.id.desc()).all()
    categories = {key: {"type": key, "file_count": 0, "size_bytes": 0} for key in ("documents", "images", "videos", "other")}
    document_extensions = {".pdf", ".doc", ".docx", ".txt", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".odt", ".ods"}
    image_extensions = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tif", ".tiff"}
    video_extensions = {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"}
    largest_files = []
    for item in records:
        extension = Path(item.original_name or "").suffix.lower()
        category = "documents" if extension in document_extensions else "images" if extension in image_extensions else "videos" if extension in video_extensions else "other"
        categories[category]["file_count"] += 1
        categories[category]["size_bytes"] += int(item.size_bytes or 0)
        if len(largest_files) < 10:
            largest_files.append({"id": item.id, "original_name": item.original_name, "size_bytes": int(item.size_bytes or 0), "created_at": item.created_at})

    return {
        "used_bytes": used,
        "total_bytes": quota,
        "quota_bytes": quota,
        "remaining_bytes": max(0, quota - used),
        "usage_percent": round(
            min(100, used / quota * 100) if quota > 0 else 100,
            4,
        ),
        "max_file_size_bytes": platform_settings["max_upload_size_bytes"],
        "file_count": len(records),
        "storage_by_type": list(categories.values()),
        "largest_files": largest_files,
    }


@router.get("/dashboard/favorites")
def list_favorites(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    rows = db.query(Favorite).filter(Favorite.user_id == current_user.id).order_by(Favorite.created_at.desc(), Favorite.id.desc()).all()
    result = []
    for favorite in rows:
        if favorite.file_id is not None:
            try:
                item, shared = get_readable_file(favorite.file_id, current_user, db)
            except HTTPException:
                continue
            metadata = file_metadata(item)
            owner = db.query(User).filter(User.id == item.owner_id).first()
            direct_share = db.query(FileShare).filter(FileShare.file_id == item.id, FileShare.owner_id == item.owner_id, FileShare.recipient_email == current_user.email, FileShare.revoked == False).first() if shared else None
            folder_share = get_active_folder_share(item.folder_id, current_user, db) if shared and item.folder_id is not None else None
            if item.folder_id is not None:
                parent = db.query(Folder).filter(Folder.id == item.folder_id, Folder.owner_id == item.owner_id).first()
                metadata["is_parent_folder_password_protected"] = bool(parent and parent.password_hash)
            result.append({**metadata, "favorite_id": favorite.id, "kind": "file", "is_shared": shared, "share_id": direct_share.id if direct_share else None, "shared_folder_id": folder_share.folder_id if folder_share and folder_share.owner_id == item.owner_id else None, "owner_name": owner.full_name if owner else "Account unavailable"})
            continue
        if favorite.folder_id is not None:
            folder = db.query(Folder).filter(Folder.id == favorite.folder_id).first()
            if folder is None:
                continue
            shared_grant = get_active_folder_share(folder.id, current_user, db) if folder.owner_id != current_user.id else None
            if folder.owner_id != current_user.id and (shared_grant is None or shared_grant.owner_id != folder.owner_id):
                continue
            owner = db.query(User).filter(User.id == folder.owner_id).first()
            result.append({"id": folder.id, "favorite_id": favorite.id, "kind": "folder", "name": folder.name, "created_at": folder.created_at, "is_password_protected": bool(folder.password_hash), "is_shared": shared_grant is not None, "permission": shared_grant.permission if shared_grant else "owner", "owner_name": owner.full_name if owner else "Account unavailable"})
    return result


@router.post("/dashboard/favorites/files/{file_id}", status_code=201)
def add_file_favorite(file_id: int, current_user: User = Depends(require_roles("admin", "user")), db: Session = Depends(get_db)):
    get_readable_file(file_id, current_user, db)
    row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.file_id == file_id).first()
    created = row is None
    if row is None:
        row = Favorite(user_id=current_user.id, file_id=file_id)
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.file_id == file_id).first()
            if row is None:
                raise HTTPException(status_code=409, detail="Could not add this favorite. Please retry.")
    if created:
        record_activity("favorite_added", current_user.id, username=getattr(current_user, "full_name", None), file_id=file_id)
    return {"id": row.id, "file_id": file_id, "kind": "file"}


@router.delete("/dashboard/favorites/files/{file_id}", status_code=204)
def remove_file_favorite(file_id: int, current_user: User = Depends(require_roles("admin", "user")), db: Session = Depends(get_db)):
    row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.file_id == file_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Favorite not found.")
    db.delete(row)
    db.commit()
    record_activity("favorite_removed", current_user.id, username=getattr(current_user, "full_name", None), file_id=file_id)


@router.post("/dashboard/favorites/folders/{folder_id}", status_code=201)
def add_folder_favorite(folder_id: int, current_user: User = Depends(require_roles("admin", "user")), db: Session = Depends(get_db)):
    folder = db.query(Folder).filter(Folder.id == folder_id).first()
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found.")
    share = get_active_folder_share(folder_id, current_user, db) if folder.owner_id != current_user.id else None
    if folder.owner_id != current_user.id and (share is None or share.owner_id != folder.owner_id):
        raise HTTPException(status_code=404, detail="Folder not found.")
    row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.folder_id == folder_id).first()
    created = row is None
    if row is None:
        row = Favorite(user_id=current_user.id, folder_id=folder_id)
        db.add(row)
        try:
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.folder_id == folder_id).first()
            if row is None:
                raise HTTPException(status_code=409, detail="Could not add this favorite. Please retry.")
    if created:
        record_activity("favorite_added", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder_id)
    return {"id": row.id, "folder_id": folder_id, "kind": "folder"}


@router.delete("/dashboard/favorites/folders/{folder_id}", status_code=204)
def remove_folder_favorite(folder_id: int, current_user: User = Depends(require_roles("admin", "user")), db: Session = Depends(get_db)):
    row = db.query(Favorite).filter(Favorite.user_id == current_user.id, Favorite.folder_id == folder_id).first()
    if row is None:
        raise HTTPException(status_code=404, detail="Favorite not found.")
    db.delete(row)
    db.commit()
    record_activity("favorite_removed", current_user.id, username=getattr(current_user, "full_name", None), folder_id=folder_id)


@router.get("", response_model=list[StoredFileResponse])
def list_files(
    current_user: User = Depends(require_roles("admin", "user")),
    folder_id: int | None = Query(default=None),
    folder_password: str | None = Query(default=None),
    folder_unlock_token: str | None = Header(default=None, alias="X-Folder-Unlock-Token"),
    db: Session = Depends(get_db),
):
    if not isinstance(folder_id, int):
        folder_id = None
    if not isinstance(folder_password, str):
        folder_password = None
    if not isinstance(folder_unlock_token, str):
        folder_unlock_token = None
    shared_folder = None
    folder_owner_id = current_user.id
    if folder_id is not None:
        folder = db.query(Folder).filter(Folder.id == folder_id).first()
        if folder is None:
            raise HTTPException(status_code=404, detail="Folder not found.")
        if folder.owner_id == current_user.id:
            require_folder_unlock(folder, current_user, folder_password, folder_unlock_token)
        else:
            shared_folder = get_active_folder_share(folder_id, current_user, db)
            if shared_folder is None or shared_folder.owner_id != folder.owner_id:
                raise HTTPException(status_code=404, detail="Folder not found.")
            require_folder_unlock(folder, current_user, folder_password, folder_unlock_token)
            folder_owner_id = folder.owner_id

    filters = [StoredFile.owner_id == folder_owner_id]

    if folder_id is not None:
        filters.append(StoredFile.folder_id == folder_id)

    files = (
        db.query(StoredFile)
        .filter(*filters)
        .order_by(StoredFile.created_at.desc())
        .all()
    )

    response = []
    favorite_file_ids = {row.file_id for row in db.query(Favorite.file_id).filter(Favorite.user_id == current_user.id, Favorite.file_id.isnot(None)).all()}
    for item in files:
        metadata = file_metadata(item)
        metadata["is_favorite"] = item.id in favorite_file_ids
        item_folder_id = getattr(item, "folder_id", None)
        if item_folder_id is not None:
            parent = db.query(Folder).filter(
                Folder.id == item_folder_id,
                Folder.owner_id == item.owner_id,
            ).first()
            metadata["is_parent_folder_password_protected"] = bool(
                parent and parent.password_hash
            )
        if shared_folder is not None:
            metadata["is_shared"] = True
            metadata["folder_permission"] = shared_folder.permission
        response.append(metadata)
    return response


@router.get("/{file_id}/download")
def download_file(
    file_id: int,
    folder_unlock_token: str | None = Header(default=None, alias="X-Folder-Unlock-Token"),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item, is_shared = get_readable_file(file_id, current_user, db)
    check_download_passwords(
        item,
        current_user,
        db,
        None,
        folder_unlock_token,
    )

    return file_download_response(item, current_user.id, requester_username=getattr(current_user, "full_name", None))


@router.post("/{file_id}/download")
def download_file_with_passwords(
    file_id: int,
    data: FileDownloadRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item, is_shared = get_readable_file(file_id, current_user, db)
    check_download_passwords(
        item,
        current_user,
        db,
        data.password,
        data.folder_unlock_token,
        folder_password=data.folder_password,
    )
    return file_download_response(item, current_user.id, requester_username=getattr(current_user, "full_name", None))


@router.post("/{file_id}/share", status_code=201)
def share_file(
    file_id: int,
    data: FileShareRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item = get_owned_file(file_id, current_user, db)
    check_parent_folder_password(
        item, current_user, db, data.folder_password, data.folder_unlock_token
    )
    recipient = str(data.recipient_email).strip().lower()
    if not re.fullmatch(r"[^\s@]+@[^\s@]+\.[^\s@]+", recipient):
        raise HTTPException(status_code=422, detail="Enter a valid recipient email.")
    recipient_user = db.query(User).filter(User.email == recipient).first()
    if recipient_user is None:
        raise HTTPException(status_code=404, detail="No TrustShare account uses that email.")
    if recipient_user.id == current_user.id:
        raise HTTPException(status_code=422, detail="You cannot share a file with yourself.")
    if data.permission != "download":
        if data.permission != "view":
            raise HTTPException(status_code=422, detail="Permission must be view or download.")
    expires_at = data.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Share expiry must be in the future.")
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    existing_share = db.query(FileShare).filter(
        FileShare.file_id == item.id,
        FileShare.recipient_email == recipient,
    ).with_for_update().first()
    is_new_share = existing_share is None
    previous_share_state = None if existing_share is None else (
        bool(existing_share.revoked), existing_share.permission, existing_share.expires_at
    )
    if existing_share is not None:
        if existing_share.revoked:
            existing_share.revoked = False
            existing_share.permission = data.permission
            existing_share.expires_at = expires_at
        else:
            existing_share.permission = data.permission
            existing_share.expires_at = expires_at
        share = existing_share
    else:
        attempted_at = datetime.now(timezone.utc)
        share = FileShare(
            share_token=secrets.token_urlsafe(32),
            file_id=item.id,
            owner_id=current_user.id,
            recipient_email=recipient,
            permission=data.permission,
            expires_at=expires_at,
            revoked=False,
            email_status="sending",
            email_attempt_count=1,
            email_attempted_at=attempted_at,
        )
        db.add(share)

    share_state = f"{share.permission}:{share.expires_at.isoformat() if share.expires_at else 'never'}"
    changed_share = is_new_share or previous_share_state != (False, data.permission, expires_at)
    # Repeating the same grant request must not resend an already accepted or
    # ambiguous invitation. Failed known rejections have an explicit retry API.
    should_send_invitation = is_new_share or changed_share or share.email_status in {None, "pending"}
    if should_send_invitation and not is_new_share:
        share.email_status = "sending"
        share.email_attempt_count = (share.email_attempt_count or 0) + 1
        share.email_attempted_at = datetime.now(timezone.utc)
        share.email_error_category = None
        share.email_sent_at = None
    try:
        db.commit()
        db.refresh(share)
    except IntegrityError:
        db.rollback()
        # Two concurrent grants may both observe no row. The unique constraint
        # selects one winner; the losing request reuses its durable delivery
        # state and never sends a second invitation.
        share = db.query(FileShare).filter(
            FileShare.file_id == item.id,
            FileShare.recipient_email == recipient,
        ).with_for_update().first()
        if share is None:
            raise HTTPException(status_code=409, detail="The share changed concurrently. Reload and try again.")
        is_new_share = False
        changed_share = False
        should_send_invitation = False
        share_state = f"{share.permission}:{share.expires_at.isoformat() if share.expires_at else 'never'}"
    if is_new_share:
        record_activity("file_share_created", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)
    if changed_share:
        create_notification(
            recipient_user.id,
            "A file was shared with you" if is_new_share else "File sharing access changed",
            f'{current_user.full_name or current_user.email} shared a file with you ({data.permission} access).',
            "file_shared" if is_new_share else "file_share_changed",
            dedupe_key=f"file_share:{share.id}:{'created' if is_new_share else share_state}:attempt-{share.email_attempt_count}",
        )
    if should_send_invitation:
        record_activity("share_email_sending", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)

    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    access_url = f"{frontend_url}/shared/{share.share_token}"
    sender_name = " ".join((current_user.full_name or current_user.email).split())
    email_sent = share.email_status == "sent"
    email_error = None
    if share.email_status == "uncertain":
        email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
    elif share.email_status == "failed":
        email_error = "The previous invitation failed. Use the explicit retry action after checking the failure status."
    try:
        if should_send_invitation:
            send_gmail_message(
                db,
                current_user.id,
                recipient,
                f"{sender_name} shared a file with you on TrustShare",
                (
                    f"{sender_name} ({gmail_status(db, current_user.id)['sender_email']}) shared "
                    f'"{item.original_name}" with you.\n\n'
                    "Open this secure TrustShare link and sign in to view and download the file:\n"
                    f"{access_url}\n\n"
                    f"Permission: {data.permission}. "
                    f"{f'This link expires at {expires_at.isoformat()} UTC.' if expires_at else 'There is no expiration date for this link.'} "
                    "The message does not include the file contents or any folder password."
                ),
            )
            share.email_status = "sent"
            share.email_sent_at = datetime.now(timezone.utc)
            share.email_error_category = None
            db.commit()
            email_sent = True
            email_error = None
            record_activity("share_email_sent", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)
    except GmailDeliveryUncertain as exc:
        file_logger.warning(
            "Invitation outcome uncertain for share_id=%s status=%s",
            share.id,
            exc.status_code,
        )
        share.email_status = "uncertain"
        share.email_error_category = "ambiguous_delivery"
        db.commit()
        email_sent = False
        email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
        record_activity("share_email_uncertain", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)
    except HTTPException as exc:
        # The share is already committed and remains available in Shared with me.
        file_logger.warning(
            "Invitation email delivery failed for share_id=%s status=%s",
            share.id,
            exc.status_code,
        )
        share.email_status = "failed"
        share.email_error_category = _email_error_category(exc)
        db.commit()
        email_sent = False
        email_error = exc.detail
        record_activity("share_email_failed", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)
    except Exception as exc:
        file_logger.warning("Invitation send failed for share_id=%s error=%s", share.id, type(exc).__name__)
        db.rollback()
        share.email_status = "uncertain"
        share.email_error_category = "ambiguous_delivery"
        db.commit()
        email_sent = False
        email_error = "Gmail may have accepted this invitation. Check Gmail Sent before retrying."
        record_activity("share_email_uncertain", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=recipient)

    return {
        "id": share.id,
        "file_id": share.file_id,
        "recipient_email": share.recipient_email,
        "permission": share.permission,
        "email_sent": email_sent,
        "email_error": email_error,
        "email_status": share.email_status,
        "email_attempt_count": share.email_attempt_count,
        "expires_at": share.expires_at,
    }


def _email_error_category(exc: HTTPException) -> str:
    detail = str(exc.detail).lower()
    if "connect gmail" in detail or "authorization" in detail or "reconnect" in detail:
        return "authorization"
    if "quota" in detail or "temporarily" in detail:
        return "quota_or_temporary"
    if "configur" in detail or "encryption" in detail:
        return "configuration"
    return "provider_error"


@router.post("/{file_id}/shares/{share_id}/retry")
def retry_share_invitation(
    file_id: int,
    share_id: int,
    data: FileDownloadRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item = get_owned_file(file_id, current_user, db)
    check_parent_folder_password(
        item, current_user, db, data.folder_password, data.folder_unlock_token
    )
    share = db.query(FileShare).filter(
        FileShare.id == share_id,
        FileShare.file_id == item.id,
        FileShare.owner_id == current_user.id,
        FileShare.revoked == 0,
    ).with_for_update().first()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found.")
    if share.email_status != "failed":
        raise HTTPException(status_code=409, detail="Only failed invitations can be retried.")
    expires_at = share.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=409, detail="This share has expired. Update the share expiry before retrying its invitation.")
    recipient = db.query(User).filter(User.email == share.recipient_email).first()
    if recipient is None:
        raise HTTPException(status_code=404, detail="The recipient no longer has a TrustShare account.")
    share.email_status = "sending"
    share.email_attempt_count = (share.email_attempt_count or 0) + 1
    share.email_attempted_at = datetime.now(timezone.utc)
    share.email_error_category = None
    share.email_sent_at = None
    db.commit()
    record_activity("share_email_sending", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=share.recipient_email)
    frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173").rstrip("/")
    sender_name = " ".join((current_user.full_name or current_user.email).split())
    try:
        sender_email = gmail_status(db, current_user.id)["sender_email"]
        send_gmail_message(db, current_user.id, share.recipient_email,
            f"{sender_name} shared a file with you on TrustShare",
            f'{sender_name} ({sender_email}) shared "{item.original_name}" with you.\n\nOpen this secure TrustShare link and sign in to view or download the file as permitted:\n{frontend_url}/shared/{share.share_token}\n\nPermission: {share.permission}. {f"This link expires at {expires_at.isoformat()} UTC." if expires_at else "This link has no expiration date."} The message does not include the file contents or any folder password.')
        share.email_status = "sent"
        share.email_sent_at = datetime.now(timezone.utc)
        share.email_error_category = None
        db.commit()
        record_activity("share_email_sent", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=share.recipient_email)
    except GmailDeliveryUncertain as exc:
        share.email_status = "uncertain"
        share.email_error_category = "ambiguous_delivery"
        db.commit()
        record_activity("share_email_uncertain", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=share.recipient_email)
        raise HTTPException(
            status_code=503,
            detail="Gmail may have accepted this invitation. Check Gmail Sent before retrying.",
        ) from exc
    except HTTPException as exc:
        share.email_status = "failed"
        share.email_error_category = _email_error_category(exc)
        db.commit()
        record_activity("share_email_failed", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=share.recipient_email)
        raise HTTPException(status_code=exc.status_code, detail=exc.detail)
    except Exception as exc:
        file_logger.warning("Invitation retry failed for share_id=%s error=%s", share.id, type(exc).__name__)
        db.rollback()
        share.email_status = "uncertain"
        share.email_error_category = "ambiguous_delivery"
        db.commit()
        record_activity("share_email_uncertain", current_user.id, username=getattr(current_user, "full_name", None), file_id=item.id, target_email=share.recipient_email)
        raise HTTPException(status_code=503, detail="Gmail may have accepted this invitation. Check Gmail Sent before retrying.") from exc
    return {"id": share.id, "email_status": share.email_status, "email_attempt_count": share.email_attempt_count}


@router.get("/dashboard/recent-uploads")
def recent_uploads(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    rows = db.query(StoredFile).filter(StoredFile.owner_id == current_user.id).order_by(StoredFile.created_at.desc(), StoredFile.id.desc()).offset(offset).limit(limit).all()
    result = []
    for item in rows:
        folder = db.query(Folder).filter(Folder.id == item.folder_id, Folder.owner_id == current_user.id).first() if item.folder_id else None
        result.append({**file_metadata(item), "folder_name": folder.name if folder else None, "upload_status": "Complete"})
    return result


@router.get("/dashboard/analytics")
def dashboard_analytics(
    days: int = Query(default=30, ge=7, le=365),
    start_date: Date | None = Query(default=None),
    end_date: Date | None = Query(default=None),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    """Return account-scoped file analytics for an explicit UTC date range."""
    now = datetime.now(timezone.utc)
    if start_date or end_date:
        last_day = end_date or now.date()
        first_day = start_date or last_day - timedelta(days=days - 1)
        if first_day > last_day:
            raise HTTPException(status_code=422, detail="start_date must be on or before end_date.")
        if (last_day - first_day).days >= 365:
            raise HTTPException(status_code=422, detail="Analytics date ranges cannot exceed 365 days.")
        since = datetime.combine(first_day, time.min, tzinfo=timezone.utc)
        until = datetime.combine(last_day + timedelta(days=1), time.min, tzinfo=timezone.utc)
    else:
        until = now
        since = now - timedelta(days=days)
        first_day = since.date()
        last_day = now.date()
    sql_since = since.replace(tzinfo=None)
    sql_until = until.replace(tzinfo=None)
    files = db.query(StoredFile).filter(StoredFile.owner_id == current_user.id).all()
    folders = db.query(Folder).filter(Folder.owner_id == current_user.id).all()
    all_file_shares = db.query(FileShare).filter(FileShare.owner_id == current_user.id).all()
    all_folder_shares = db.query(FolderShare).filter(FolderShare.owner_id == current_user.id).all()
    period_files = [item for item in files if item.created_at and sql_since <= item.created_at.replace(tzinfo=None) < sql_until]
    file_shares = db.query(FileShare).filter(
        FileShare.owner_id == current_user.id,
        FileShare.created_at >= sql_since,
        FileShare.created_at < sql_until,
    ).all()
    folder_shares = db.query(FolderShare).filter(
        FolderShare.owner_id == current_user.id,
        FolderShare.created_at >= sql_since,
        FolderShare.created_at < sql_until,
    ).all()

    def file_category(filename):
        extension = Path(filename or "").suffix.lower()
        if extension in {".pdf", ".doc", ".docx", ".txt", ".rtf", ".xls", ".xlsx", ".csv", ".ppt", ".pptx", ".odt", ".ods"}:
            return "documents"
        if extension in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".tif", ".tiff"}:
            return "images"
        if extension in {".mp4", ".mov", ".avi", ".mkv", ".webm", ".mpeg", ".mpg"}:
            return "videos"
        return "other"

    storage_types = {key: {"type": key, "bytes": 0, "file_count": 0} for key in ("documents", "images", "videos", "other")}
    for item in files:
        row = storage_types[file_category(item.original_name)]
        row["bytes"] += item.size_bytes or 0
        row["file_count"] += 1
    storage_used = sum(row["bytes"] for row in storage_types.values())
    for row in storage_types.values():
        row["percent_of_used"] = round(row["bytes"] * 100 / storage_used, 1) if storage_used else 0

    daily = {}
    cursor_day = first_day
    while cursor_day <= last_day:
        day = cursor_day.isoformat()
        daily[day] = {"date": day, "uploads": 0, "upload_types": {"documents": 0, "images": 0, "videos": 0, "other": 0}, "downloads": 0, "unique_users": 0, "shared_downloads": 0, "direct_shares": 0, "folder_shares": 0, "shares": 0}
        cursor_day += timedelta(days=1)
    for item in period_files:
        day = item.created_at.date().isoformat()
        if day in daily:
            category = file_category(item.original_name)
            daily[day]["uploads"] += 1
            daily[day]["upload_types"][category] += 1
    for share in file_shares:
        day = share.created_at.date().isoformat()
        if day in daily:
            daily[day]["direct_shares"] += 1
            daily[day]["shares"] += 1
    for share in folder_shares:
        day = share.created_at.date().isoformat()
        if day in daily:
            daily[day]["folder_shares"] += 1
            daily[day]["shares"] += 1

    collection = mongo_db["activity_logs"]
    event_window = {"created_at": {"$gte": since, "$lt": until}}
    download_filter = {
        **event_window,
        "event_type": "file_download_success",
        "$or": [{"user_id": current_user.id}, {"resource_owner_id": current_user.id}],
    }
    daily_downloads = collection.aggregate([
        {"$match": download_filter},
        {"$group": {"_id": {"day": {"$dateToString": {"format": "%Y-%m-%d", "date": "$created_at", "timezone": "UTC"}}}, "count": {"$sum": 1}, "users": {"$addToSet": "$user_id"}, "shared_downloads": {"$sum": {"$cond": [{"$eq": ["$shared_download", True]}, 1, 0]}}}},
    ])
    for group in daily_downloads:
        day = group.get("_id", {}).get("day")
        if day in daily:
            daily[day]["downloads"] += group.get("count", 0)
            daily[day]["shared_downloads"] = group.get("shared_downloads", 0)
            daily[day]["unique_users"] = len(group.get("users", []))
    downloads = list(collection.find(download_filter, {"_id": 0}).sort("created_at", -1).limit(500))
    shared_file_downloads = collection.count_documents({
        **event_window,
        "event_type": "file_download_success",
        "resource_owner_id": current_user.id,
        "shared_download": True,
    })
    unique_downloaders = len(collection.distinct("user_id", {
        **event_window,
        "event_type": "file_download_success",
        "resource_owner_id": current_user.id,
        "user_id": {"$ne": current_user.id},
    }))
    all_known_files = {item.id: item for item in files}
    recent_downloads = []
    for event in downloads:
        item = all_known_files.get(event.get("file_id"))
        if item is None and event.get("user_id") == current_user.id and event.get("file_id") is not None:
            item = db.query(StoredFile).filter(StoredFile.id == event["file_id"]).first()
        if item is None:
            continue
        downloader = "You" if event.get("user_id") == current_user.id else None
        if downloader is None and event.get("user_id") is not None:
            downloader_user = db.query(User).filter(User.id == event["user_id"]).first()
            downloader = downloader_user.email if downloader_user else "Account unavailable"
        recent_downloads.append({
            "id": f"{event.get('file_id')}-{event.get('created_at').timestamp()}",
            "file_name": item.original_name,
            "downloaded_by": downloader or "Not recorded",
            "created_at": event.get("created_at"),
            "size_bytes": item.size_bytes,
            "shared_download": bool(event.get("shared_download")),
        })
        if len(recent_downloads) >= 10:
            break

    upload_count = len(period_files)
    download_count = collection.count_documents(download_filter)
    total_shares = len(file_shares) + len(folder_shares)
    total_capacity = get_platform_settings(db)["per_user_storage_quota_bytes"]
    invitation_status_counts = {
        status: sum((share.email_status or "pending") == status for share in all_file_shares)
        for status in ("pending", "sending", "sent", "failed")
    }
    return {
        "period_days": days,
        "start_date": since,
        "end_date": until - timedelta(microseconds=1),
        "summary": {
            "storage_used_bytes": storage_used,
            "storage_capacity_bytes": total_capacity,
            "storage_used_percent": round(storage_used * 100 / total_capacity, 1) if total_capacity else 0,
            "file_count": len(files),
            "folder_count": len(folders),
            "uploads": upload_count,
            "downloads": download_count,
            "active_shares": sum(not share.revoked for share in file_shares) + sum(not share.revoked for share in folder_shares),
            "total_shares": total_shares,
            "total_shared_files": len({share.file_id for share in all_file_shares if not share.revoked}),
            "total_file_invitations": len(all_file_shares),
            "active_file_invitations": sum(not share.revoked for share in all_file_shares),
            "revoked_file_invitations": sum(bool(share.revoked) for share in all_file_shares),
            "folder_access_grants": len(all_folder_shares),
            "invitation_status_counts": invitation_status_counts,
            "shared_file_downloads": shared_file_downloads,
            "unique_downloaders": unique_downloaders,
        },
        "storage_by_type": list(storage_types.values()),
        "reports": list(daily.values()),
        "recent_uploads": [{"id": item.id, "file_name": item.original_name, "created_at": item.created_at, "size_bytes": item.size_bytes, "file_type": file_category(item.original_name)} for item in sorted(period_files, key=lambda item: item.created_at or datetime.min, reverse=True)[:10]],
        "recent_downloads": recent_downloads,
    }


@router.get("/dashboard/activity")
def dashboard_activity(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
):
    labels = {
        "registration_success": ("Account registered", "Success"),
        "login_success": ("Signed in", "Success"),
        "login_failed": ("Sign-in attempt failed", "Failed"),
        "login_blocked": ("Sign-in temporarily blocked", "Blocked"),
        "unauthorized_access": ("A protected action was denied", "Denied"),
        "provider_linked": ("Authentication provider linked", "Success"),
        "file_upload_success": ("File uploaded", "Success"), "file_download_success": ("File downloaded", "Success"),
        "file_delete_success": ("File deleted", "Success"), "file_move_success": ("File moved", "Success"),
        "share_email_sending": ("Sharing invitation started", "Pending"), "share_email_sent": ("Sharing invitation accepted by provider", "Success"),
        "share_email_failed": ("Sharing invitation failed", "Failed"), "file_share_revoked": ("File share revoked", "Success"), "file_share_created": ("File shared", "Success"),
        "folder_create_success": ("Folder created", "Success"), "folder_delete_success": ("Folder deleted", "Success"),
        "folder_rename_success": ("Folder renamed", "Success"),
        "folder_access_granted": ("Folder access granted", "Success"), "folder_access_changed": ("Folder permission changed", "Success"), "folder_access_revoked": ("Folder access revoked", "Success"),
        "favorite_added": ("Added to Favorites", "Success"), "favorite_removed": ("Removed from Favorites", "Success"),
    }
    rows = list(mongo_db["activity_logs"].find({
        "user_id": current_user.id,
        "event_type": {"$in": list(labels)},
    }).sort("created_at", -1).skip(offset).limit(limit))
    result = []
    for row in rows:
        label = labels.get(row.get("event_type"))
        if not label:
            continue
        target_name = None
        if row.get("file_id"):
            target_name = row.get("target_name")
            if target_name is None:
                try:
                    target, _ = get_readable_file(row["file_id"], current_user, db)
                    target_name = target.original_name
                except HTTPException:
                    pass
        elif row.get("folder_id"):
            target_name = row.get("target_name")
            target = db.query(Folder).filter(Folder.id == row["folder_id"]).first()
            if target is not None and (target.owner_id == current_user.id or (get_active_folder_share(target.id, current_user, db) is not None and get_active_folder_share(target.id, current_user, db).owner_id == target.owner_id)):
                target_name = target_name or target.name
        result.append({"id": str(row.get("_id")), "action": label[0], "result": label[1], "created_at": row.get("created_at"), "target_name": target_name, "target_email": row.get("target_email"), "details": row.get("details"), "severity": row.get("severity")})
    return result


@router.get("/dashboard/shares")
def dashboard_shares(current_user: User = Depends(require_roles("admin", "user")), db: Session = Depends(get_db)):
    rows = db.query(FileShare).filter(FileShare.owner_id == current_user.id).order_by(FileShare.created_at.desc(), FileShare.id.desc()).all()
    entries = []
    now = datetime.now(timezone.utc)
    for share in rows:
        item = db.query(StoredFile).filter(StoredFile.id == share.file_id, StoredFile.owner_id == current_user.id).first()
        if item is None:
            continue
        share_status = "Revoked" if share.revoked else "Expired" if not file_share_is_active(share, now) else "Active"
        entries.append({"id": share.id, "item_type": "file", "file_id": item.id, "file_name": item.original_name, "content_type": item.content_type, "recipient_email": share.recipient_email, "created_at": share.created_at, "expires_at": getattr(share, "expires_at", None), "permission": share.permission, "share_token": share.share_token, "email_status": share.email_status or "unknown", "email_attempt_count": share.email_attempt_count or 0, "email_attempted_at": share.email_attempted_at, "email_sent_at": share.email_sent_at, "email_error_category": share.email_error_category, "access_status": share_status})
    folder_shares = db.query(FolderShare).filter(FolderShare.owner_id == current_user.id).order_by(FolderShare.created_at.desc(), FolderShare.id.desc()).all()
    now = datetime.now(timezone.utc)
    for share in folder_shares:
        folder = db.query(Folder).filter(Folder.id == share.folder_id, Folder.owner_id == current_user.id).first()
        if folder is None:
            continue
        expiry = share.expires_at
        if expiry is not None and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        status = "Revoked" if share.revoked else "Expired" if expiry and expiry <= now else "Active"
        entries.append({"id": share.id, "item_type": "folder", "folder_id": folder.id, "file_name": folder.name, "recipient_email": share.recipient_email, "created_at": share.created_at, "permission": share.permission, "expires_at": share.expires_at, "email_status": "not_configured", "access_status": status})
    def share_created_timestamp(entry):
        created_at = entry.get("created_at") or datetime.min
        if created_at.tzinfo is None:
            created_at = created_at.replace(tzinfo=timezone.utc)
        return created_at.timestamp()

    entries.sort(key=share_created_timestamp, reverse=True)
    active = [entry for entry in entries if entry["access_status"] == "Active"]
    sent = [entry for entry in active if entry["email_status"] == "sent"]
    return {"summary": {
        "total_shared_files": len({entry["file_id"] for entry in active}),
        "successfully_shared_files": len({entry["file_id"] for entry in sent}),
        "sent_emails": len(sent),
        "pending_emails": sum(entry["email_status"] in ("pending", "sending") for entry in active),
        "failed_emails": sum(entry["email_status"] == "failed" for entry in active),
        "active_recipient_shares": len(active),
    }, "invitations": entries}


@router.get("/shared/with-me")
def list_shared_files(
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    shares = db.query(FileShare).filter(
        FileShare.recipient_email == current_user.email,
        FileShare.revoked == 0,
    ).all()
    items = []
    seen_ids = set()
    favorite_file_ids = {row.file_id for row in db.query(Favorite.file_id).filter(Favorite.user_id == current_user.id, Favorite.file_id.isnot(None)).all()}
    for share in shares:
        if share.permission not in {"view", "download"} or not file_share_is_active(share):
            continue
        item = db.query(StoredFile).filter(StoredFile.id == share.file_id, StoredFile.owner_id == share.owner_id).first()
        owner = db.query(User).filter(User.id == share.owner_id).first()
        if item is not None and owner is not None:
            metadata = file_metadata(item)
            metadata["is_favorite"] = item.id in favorite_file_ids
            if item.folder_id is not None:
                parent = db.query(Folder).filter(
                    Folder.id == item.folder_id,
                    Folder.owner_id == item.owner_id,
                ).first()
                metadata["is_parent_folder_password_protected"] = bool(
                    parent and parent.password_hash
                )
            items.append({**metadata, "share_id": share.id, "share_token": share.share_token, "owner_name": owner.full_name, "permission": share.permission, "is_shared": True})
            seen_ids.add(item.id)
    folder_shares = db.query(FolderShare).filter(FolderShare.recipient_email == current_user.email).all()
    for share in folder_shares:
        if not folder_share_is_active(share):
            continue
        folder = db.query(Folder).filter(Folder.id == share.folder_id, Folder.owner_id == share.owner_id).first()
        owner = db.query(User).filter(User.id == share.owner_id).first()
        if folder is None or owner is None:
            continue
        for item in db.query(StoredFile).filter(StoredFile.folder_id == folder.id, StoredFile.owner_id == folder.owner_id).all():
            if item.id in seen_ids:
                continue
            metadata = file_metadata(item)
            metadata["is_favorite"] = item.id in favorite_file_ids
            metadata["is_parent_folder_password_protected"] = bool(folder.password_hash)
            items.append({**metadata, "share_id": None, "owner_name": owner.full_name, "permission": share.permission, "is_shared": True, "folder_permission": share.permission, "shared_folder_id": folder.id})
            seen_ids.add(item.id)
    return items


@router.get("/shared/{share_token}")
def get_shared_file_info(
    share_token: str,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    share = db.query(FileShare).filter(
        FileShare.share_token == share_token,
        FileShare.recipient_email == current_user.email,
        FileShare.revoked == 0,
    ).first()
    if (
        share is not None
        and share.expires_at is not None
        and not file_share_is_active(share)
    ):
        raise HTTPException(
            status_code=404,
            detail="This sharing link has expired",
        )
    if share is None or share.permission not in {"view", "download"} or not file_share_is_active(share):
        raise HTTPException(status_code=404, detail="Shared file not found.")
    item = db.query(StoredFile).filter(
        StoredFile.id == share.file_id,
        StoredFile.owner_id == share.owner_id,
    ).first()
    owner = db.query(User).filter(User.id == share.owner_id).first()
    if item is None or owner is None:
        raise HTTPException(status_code=404, detail="Shared file not found.")
    metadata = file_metadata(item)
    if item.folder_id is not None:
        parent = db.query(Folder).filter(
            Folder.id == item.folder_id,
            Folder.owner_id == item.owner_id,
        ).first()
        metadata["is_parent_folder_password_protected"] = bool(
            parent and parent.password_hash
        )
    return {
        **metadata,
        "share_id": share.id,
        "owner_name": owner.full_name,
        "permission": share.permission,
        "expires_at": getattr(share, "expires_at", None),
    }
@router.post("/{file_id}/preview")
def preview_file(
    file_id: int,
    data: FileDownloadRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item, _ = get_readable_file(file_id, current_user, db)
    preview_media_type = require_preview_content_type(item)

    check_parent_folder_password(
        item,
        current_user,
        db,
        data.folder_password,
        data.folder_unlock_token,
    )
    check_file_password(item, data.password)

    return file_download_response(
        item,
        current_user.id,
        requester_username=getattr(current_user, "full_name", None),
        inline=True,
        preview_media_type=preview_media_type,
    )


@router.post("/shared/{share_token}/preview")
def preview_shared_file(
    share_token: str,
    data: FileDownloadRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    share = db.query(FileShare).filter(
        FileShare.share_token == share_token,
        FileShare.recipient_email == current_user.email,
        FileShare.revoked == 0,
    ).first()
    if (
        share is not None
        and share.expires_at is not None
        and not file_share_is_active(share)
    ):
        raise HTTPException(
            status_code=404,
            detail="This sharing link has expired",
        )
    if share is None or share.permission not in {"view", "download"} or not file_share_is_active(share):
        raise HTTPException(status_code=404, detail="Shared file not found.")
    item = db.query(StoredFile).filter(
        StoredFile.id == share.file_id,
        StoredFile.owner_id == share.owner_id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Shared file not found.")
    preview_media_type = require_preview_content_type(item)
    check_parent_folder_password(item, current_user, db, data.folder_password, data.folder_unlock_token)
    check_file_password(item, data.password)
    return file_download_response(
        item,
        current_user.id,
        requester_username=getattr(current_user, "full_name", None),
        inline=True,
        preview_media_type=preview_media_type,
    )


@router.get("/{file_id}/shares")
def list_file_shares(
    file_id: int,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    get_owned_file(file_id, current_user, db)
    return db.query(FileShare).filter(
        FileShare.file_id == file_id,
        FileShare.owner_id == current_user.id,
        FileShare.revoked == 0,
    ).all()


@router.get("/shared/{share_token}/download")
def download_shared_file(
    share_token: str,
    folder_password: str | None = Query(default=None),
    folder_unlock_token: str | None = Header(default=None, alias="X-Folder-Unlock-Token"),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    if not isinstance(folder_password, str):
        folder_password = None
    share = db.query(FileShare).filter(
        FileShare.share_token == share_token,
        FileShare.recipient_email == current_user.email,
    ).first()
    if (
        share is not None
        and not share.revoked
        and share.expires_at is not None
        and not file_share_is_active(share)
    ):
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(
            status_code=404,
            detail="This sharing link has expired",
        )
    if share is None or not file_share_is_active(share):
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(status_code=404, detail="Shared file not found.")
    if share.permission != "download":
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(status_code=404, detail="Shared file not found.")
    item = db.query(StoredFile).filter(StoredFile.id == share.file_id, StoredFile.owner_id == share.owner_id).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Shared file not found.")
    if not isinstance(folder_password, str):
        folder_password = None
    check_download_passwords(
        item,
        current_user,
        db,
        None,
        folder_unlock_token,
        folder_password=folder_password,
    )
    return file_download_response(item, current_user.id, requester_username=getattr(current_user, "full_name", None))


@router.post("/shared/{share_token}/download")
def download_shared_file_with_password(
    share_token: str,
    data: FileDownloadRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    share = db.query(FileShare).filter(
        FileShare.share_token == share_token,
        FileShare.recipient_email == current_user.email,
    ).first()
    if (
        share is not None
        and not share.revoked
        and share.expires_at is not None
        and not file_share_is_active(share)
    ):
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(
            status_code=404,
            detail="This sharing link has expired",
        )
    if share is None or not file_share_is_active(share):
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(status_code=404, detail="Shared file not found.")
    if share.permission != "download":
        record_share_access_denial(share, current_user, share_token, permission="download")
        raise HTTPException(status_code=404, detail="Shared file not found.")
    item = db.query(StoredFile).filter(
        StoredFile.id == share.file_id,
        StoredFile.owner_id == share.owner_id,
    ).first()
    if item is None:
        raise HTTPException(status_code=404, detail="Shared file not found.")
    check_download_passwords(
        item,
        current_user,
        db,
        data.password,
        data.folder_unlock_token,
        folder_password=data.folder_password,
    )
    return file_download_response(item, current_user.id, requester_username=getattr(current_user, "full_name", None))


@router.delete("/{file_id}/shares/{share_id}", status_code=204)
def revoke_file_share(
    file_id: int,
    share_id: int,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    get_owned_file(file_id, current_user, db)
    share = db.query(FileShare).filter(
        FileShare.id == share_id,
        FileShare.file_id == file_id,
        FileShare.owner_id == current_user.id,
        FileShare.revoked == 0,
    ).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found.")
    share.revoked = True
    db.commit()
    record_activity("file_share_revoked", current_user.id, username=getattr(current_user, "full_name", None), file_id=file_id, target_email=share.recipient_email)
    recipient = db.query(User).filter(User.email == share.recipient_email).first()
    if recipient is not None:
        create_notification(
            recipient.id, "File access revoked", "The owner revoked your access to a shared file.",
            "file_share_revoked", dedupe_key=f"file_share:{share.id}:revoked",
        )
    return None


@router.patch("/{file_id}/shares/{share_id}")
def update_file_share(
    file_id: int,
    share_id: int,
    data: FileShareUpdateRequest,
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    get_owned_file(file_id, current_user, db)
    share = db.query(FileShare).filter(
        FileShare.id == share_id,
        FileShare.file_id == file_id,
        FileShare.owner_id == current_user.id,
        FileShare.revoked == 0,
    ).first()
    if share is None:
        raise HTTPException(status_code=404, detail="Share not found.")
    if data.permission not in {"view", "download"}:
        raise HTTPException(status_code=422, detail="Permission must be view or download.")
    expires_at = data.expires_at
    if expires_at is not None:
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if expires_at <= datetime.now(timezone.utc):
            raise HTTPException(status_code=422, detail="Share expiry must be in the future.")
        expires_at = expires_at.astimezone(timezone.utc).replace(tzinfo=None)
    previous_state = (share.permission, share.expires_at)
    share.permission = data.permission
    share.expires_at = expires_at
    db.commit()
    record_activity("file_share_changed", current_user.id, username=getattr(current_user, "full_name", None), file_id=file_id, target_email=share.recipient_email)
    if previous_state != (share.permission, share.expires_at):
        recipient = db.query(User).filter(User.email == share.recipient_email).first()
        if recipient is not None:
            create_notification(
                recipient.id,
                "File sharing access changed",
                f"The owner changed your file access to {share.permission}.",
                "file_share_changed",
                dedupe_key=f"file_share:{share.id}:changed:{share.permission}:{share.expires_at.isoformat() if share.expires_at else 'never'}",
            )
    return {
        "id": share.id,
        "permission": share.permission,
        "expires_at": share.expires_at,
        "access_status": "Active",
    }



@router.delete("/{file_id}", status_code=204)
def delete_file(
    file_id: int,
    password: str | None = Query(default=None),
    folder_password: str | None = Query(default=None),
    folder_unlock_token: str | None = Header(
        default=None,
        alias="X-Folder-Unlock-Token",
    ),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item, is_shared_editor = get_writable_file(
        file_id, current_user, db
    )

    if not isinstance(folder_password, str):
        folder_password = None

    check_parent_folder_password(
        item, current_user, db, folder_password, folder_unlock_token
    )
    check_file_password(item, password)

    backend = getattr(item, "storage_backend", "local") or "local"
    path = storage_path(item.stored_name) if backend == "local" else None
    staged_path = (
        storage_path(f"{uuid4().hex}.deleting")
        if backend == "local"
        else None
    )
    cloud_backup = None

    try:
        if backend == "local":
            if path.exists():
                os.replace(path, staged_path)
        else:
            cloud_backup = storage_service.get_object(
                item.stored_name, backend
            )
            storage_service.delete_object(item.stored_name, backend)

        db.delete(item)
        db.commit()

    except Exception as exc:
        db.rollback()

        if backend == "local" and staged_path.exists():
            try:
                os.replace(staged_path, path)
            except OSError:
                file_logger.exception(
                    "Failed to restore local file after database rollback "
                    "for file_id=%s",
                    file_id,
                )

        elif backend in {"s3", "azure"} and cloud_backup is not None:
            try:
                storage_service.put_object(
                    item.stored_name, cloud_backup, backend
                )
            except Exception:
                file_logger.exception(
                    "Failed to restore cloud object after database rollback "
                    "for file_id=%s",
                    file_id,
                )

        file_logger.exception(
            "Unable to delete file record for file_id=%s",
            file_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to remove the file record.",
        ) from exc

    record_activity(
        "file_delete_success",
        current_user.id, username=getattr(current_user, "full_name", None),
        file_id=item.id,
        target_name=item.original_name,
    )

    try:
        if backend == "local" and staged_path is not None:
            staged_path.unlink(missing_ok=True)
    except OSError as exc:
        file_logger.warning(
            "Storage cleanup failed for file_id=%s",
            file_id,
        )
        raise HTTPException(
            status_code=500,
            detail=(
                "The file record was removed, but its stored object "
                "could not be cleaned up."
            ),
        ) from exc

    return None

@router.patch("/{file_id}/move")
def move_file(
    file_id: int,
    folder_id: int | None = Query(default=None),
    password: str | None = Query(default=None),
    source_folder_password: str | None = Query(default=None),
    destination_password: str | None = Query(default=None),
    source_unlock_token: str | None = Header(default=None, alias="X-Source-Folder-Unlock-Token"),
    destination_unlock_token: str | None = Header(default=None, alias="X-Destination-Folder-Unlock-Token"),
    current_user: User = Depends(require_roles("admin", "user")),
    db: Session = Depends(get_db),
):
    item = get_owned_file(file_id, current_user, db)

    check_parent_folder_password(
        item,
        current_user,
        db,
        source_folder_password or password,
        source_unlock_token,
    )
    check_file_password(item, password)

    if folder_id is not None:
        destination = get_owned_folder(
            folder_id, current_user, db
        )
        require_folder_unlock(
            destination, current_user, destination_password, destination_unlock_token
        )

    if item.folder_id == folder_id:
        return file_metadata(item)

    try:
        item.folder_id = folder_id
        db.commit()
        db.refresh(item)
    except Exception:
        db.rollback()
        file_logger.exception(
            "Unable to move file_id=%s",
            file_id,
        )
        raise HTTPException(
            status_code=500,
            detail="Unable to move the file.",
        )

    record_activity(
        "file_move_success",
        current_user.id, username=getattr(current_user, "full_name", None),
        file_id=item.id,
    )

    return file_metadata(item)
