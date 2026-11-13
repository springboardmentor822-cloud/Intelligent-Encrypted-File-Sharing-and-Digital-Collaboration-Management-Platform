"""Shared file logic: validation, encrypted store/retrieve, safe responses."""
import os, re, unicodedata
from urllib.parse import quote
from fastapi import HTTPException, Request, UploadFile
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from ..config import get_settings
from ..db import utcnow
from ..models import DownloadRecord, File, User
from ..state import encryption, storage
from ..services.audit import audit, client_ip, security_event
from ..services.encryption import DecryptionError
from ..services.storage import ObjectNotFound, StorageError, new_key

settings = get_settings()

CATEGORIES = {
    "documents": {
        "pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv", "md", "rtf",
        "odt", "ods", "odp", "pages", "numbers", "key", "epub", "tex", "log",
        "json", "xml", "yaml", "yml", "html", "htm", "css", "js", "ts", "jsx", "tsx",
        "py", "java", "c", "cpp", "h", "cs", "go", "rs", "rb", "php", "sh", "sql",
        "ini", "cfg", "toml", "conf",
    },
    "images": {"png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "tiff", "tif", "ico", "heic", "heif", "avif"},
    "videos": {"mp4", "webm", "mov", "mkv", "avi", "wmv", "flv", "m4v", "mpg", "mpeg", "3gp"},
}
# Audio, archives and other common files are accepted too and simply show up
# under the "others" category.
EXTRA_ALLOWED = {
    "mp3", "wav", "ogg", "flac", "m4a", "aac", "opus", "wma",
    "zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz",
}
ALLOWED = set().union(*CATEGORIES.values()) | EXTRA_ALLOWED
MIME = {"pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "gif": "image/gif",
        "webp": "image/webp", "txt": "text/plain", "csv": "text/csv", "md": "text/plain", "mp4": "video/mp4",
        "webm": "video/webm", "mov": "video/quicktime", "rtf": "application/rtf",
        "doc": "application/msword", "xls": "application/vnd.ms-excel", "ppt": "application/vnd.ms-powerpoint",
        "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation"}
INLINE_SAFE = {"pdf", "png", "jpg", "jpeg", "gif", "webp", "txt", "mp4", "webm"}
_SIGS = {"pdf": [b"%PDF"], "png": [b"\x89PNG\r\n\x1a\n"], "jpg": [b"\xff\xd8\xff"], "jpeg": [b"\xff\xd8\xff"],
         "gif": [b"GIF87a", b"GIF89a"], "docx": [b"PK\x03\x04"], "xlsx": [b"PK\x03\x04"], "pptx": [b"PK\x03\x04"],
         "doc": [b"\xd0\xcf\x11\xe0"], "xls": [b"\xd0\xcf\x11\xe0"], "ppt": [b"\xd0\xcf\x11\xe0"], "rtf": [b"{\\rtf"]}
_TEXT = {"txt", "csv", "md"}


def category_of(ext: str) -> str:
    for c, exts in CATEGORIES.items():
        if ext in exts:
            return c
    return "others"


def safe_name(name: str) -> str:
    name = unicodedata.normalize("NFKC", os.path.basename((name or "").replace("\\", "/")))
    name = re.sub(r"[\x00-\x1f<>:\"|?*]", "", name).strip(" .")
    return name[:200]


def validate_content(ext: str, head: bytes, data: bytes):
    if ext in _TEXT:
        if b"\x00" in data[:8192]:
            raise HTTPException(415, "File content does not match its extension")
    elif ext == "webp":
        if not (head[:4] == b"RIFF" and head[8:12] == b"WEBP"):
            raise HTTPException(415, "File content does not match its extension")
    elif ext in ("mp4", "mov"):
        if head[4:8] != b"ftyp":
            raise HTTPException(415, "File content does not match its extension")
    elif ext == "webm":
        if head[:4] != b"\x1a\x45\xdf\xa3":
            raise HTTPException(415, "File content does not match its extension")
    elif ext in _SIGS and not any(head.startswith(s) for s in _SIGS[ext]):
        raise HTTPException(415, "File content does not match its extension")


async def read_limited(up: UploadFile) -> bytes:
    buf = bytearray()
    while chunk := await up.read(1024 * 1024):
        buf += chunk
        if len(buf) > settings.max_upload_bytes:
            raise HTTPException(413, f"File exceeds the {settings.max_upload_mb} MB limit")
    return bytes(buf)


def used_bytes(db: Session, user_id: str) -> int:
    return db.scalar(select(func.coalesce(func.sum(File.size), 0)).where(File.owner_id == user_id)) or 0


def unique_name(db: Session, owner_id: str, folder_id: str | None, name: str, exclude_id: str | None = None) -> str:
    stem, dot, ext = name.rpartition(".")
    if not dot:
        stem, ext = name, ""
    existing = set(db.scalars(select(File.original_name).where(File.owner_id == owner_id, File.folder_id == folder_id,
                                                              File.deleted_at.is_(None), File.id != (exclude_id or ""))))
    cand, i = name, 1
    while cand in existing:
        cand = f"{stem} ({i}){'.' + ext if ext else ''}"; i += 1
    return cand


def store_encrypted(db: Session, owner: User, name: str, data: bytes, folder_id: str | None, request: Request) -> File:
    name = safe_name(name)
    if not name or "." not in name:
        raise HTTPException(422, "A file name with an extension is required")
    ext = name.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(415, f"File type .{ext} is not allowed")
    if len(data) == 0:
        raise HTTPException(422, "File is empty")
    validate_content(ext, data[:16], data)
    if used_bytes(db, owner.id) + len(data) > owner.quota_bytes:
        raise HTTPException(413, "Storage quota exceeded")
    f = File(owner_id=owner.id, folder_id=folder_id, original_name=unique_name(db, owner.id, folder_id, name), ext=ext,
             mime=MIME.get(ext, "application/octet-stream"), size=len(data), category=category_of(ext),
             storage_backend=storage().name, storage_key=new_key(), nonce="", wrapped_dek="", kek_version=0)
    db.add(f); db.flush()
    blob = encryption.encrypt(data, f.id)           # encrypt BEFORE anything touches permanent storage
    f.nonce, f.wrapped_dek, f.kek_version = blob.nonce_b64, blob.wrapped_dek, blob.kek_version
    try:
        storage().put(f.storage_key, blob.ciphertext)
    except StorageError:
        db.rollback()
        raise HTTPException(503, "Storage backend unavailable")
    db.commit()
    audit(db, "file.upload", request=request, actor_id=owner.id, owner_id=owner.id, resource_type="file",
          resource_id=f.id, details={"size": f.size, "ext": ext})
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "file_upload", user_id=owner.id, file_id=f.id, request=request,
                        details={"size": f.size, "ext": ext, "name": f.original_name})
    except Exception:
        pass
    return f


def read_decrypted(db: Session, f: File, request: Request, actor_id: str | None) -> bytes:
    try:
        ct = storage().get(f.storage_key)
        return encryption.decrypt(ct, file_id=f.id, nonce_b64=f.nonce, wrapped_dek=f.wrapped_dek, kek_version=f.kek_version)
    except DecryptionError:
        security_event(db, "integrity_failure", "critical", "Encrypted file failed integrity verification",
                       request=request, user_id=actor_id, resource=f"file:{f.id}")
        from ..services.audit import raise_alert
        raise_alert(db, "integrity_failure", "critical", "Encrypted file failed integrity verification",
                    f"'{f.original_name}' could not be decrypted: its data key did not unwrap or the ciphertext "
                    "failed authentication. Possible corruption or tampering.",
                    request=request, user_id=f.owner_id, resource=f"file:{f.id}", details={"file_id": f.id})
        audit(db, "file.integrity_failure", request=request, actor_id=actor_id, owner_id=f.owner_id,
              resource_type="file", resource_id=f.id, outcome="failure")
        raise HTTPException(500, "This file failed integrity verification and cannot be delivered")
    except ObjectNotFound:
        security_event(db, "integrity_failure", "high", "Encrypted object missing from storage", request=request,
                       user_id=actor_id, resource=f"file:{f.id}")
        raise HTTPException(500, "Stored object is missing")
    except StorageError:
        raise HTTPException(503, "Storage backend unavailable")


def file_response(f: File, data: bytes, inline: bool) -> Response:
    inline = inline and f.ext in INLINE_SAFE
    cd = f"{'inline' if inline else 'attachment'}; filename=\"download.{f.ext}\"; filename*=UTF-8''{quote(f.original_name)}"
    return Response(data, media_type=f.mime if inline else "application/octet-stream", headers={
        "Content-Disposition": cd, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store",
        "Content-Security-Policy": "sandbox; default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'"})


def record_download(db: Session, f: File, request: Request, *, user_id: str | None, share_id: str | None, action: str):
    db.add(DownloadRecord(file_id=f.id, owner_id=f.owner_id, user_id=user_id, share_id=share_id, action=action,
                          bytes=f.size, ip=client_ip(request)))
    f.last_accessed_at = utcnow(); db.commit()
    audit(db, f"file.{action}", request=request, actor_id=user_id, owner_id=f.owner_id, resource_type="file",
          resource_id=f.id, details={"via": "share" if share_id else "owner", "share_id": share_id})
    # Milestone 3 — activity stream + owner download notification for shared access.
    try:
        from ..activity_monitoring import service as activity
        activity.record(db, "file_download" if action == "download" else "file_view", user_id=user_id,
                        file_id=f.id, request=request,
                        details={"via": "share" if share_id else "owner", "share_id": share_id})
        if action == "download" and share_id and user_id and user_id != f.owner_id:
            from ..notifications import service as notify_service
            actor = db.get(User, user_id)
            who = (actor.full_name or actor.email) if actor else "Someone"
            notify_service.notify(db, f.owner_id, "Shared file downloaded",
                                  f"{who} downloaded \u201c{f.original_name}\u201d via a share link.",
                                  type="file_downloaded", severity="info", link="/app/shared-by-me",
                                  meta={"file_id": f.id, "share_id": share_id, "by": user_id})
    except Exception:
        pass
    if action == "download" and user_id:
        from datetime import timedelta
        n = db.scalar(select(func.count()).select_from(DownloadRecord).where(
            DownloadRecord.user_id == user_id, DownloadRecord.action == "download",
            DownloadRecord.created_at >= utcnow() - timedelta(minutes=10)))
        if n == settings.abnormal_download_threshold:
            security_event(db, "abnormal_download", "high", f"{n} downloads within 10 minutes", request=request,
                           user_id=user_id, details={"count": n})
            from ..services.audit import raise_alert
            raise_alert(db, "abnormal_download", "high", "Abnormal download volume",
                        f"One account downloaded {n} files within 10 minutes. This may be bulk exfiltration.",
                        request=request, user_id=user_id, resource=f"user:{user_id}", details={"count": n})
