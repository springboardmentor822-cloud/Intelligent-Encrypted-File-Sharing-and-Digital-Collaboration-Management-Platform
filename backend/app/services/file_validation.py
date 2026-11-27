"""Upload validation: extension allow-list, size limit and magic-byte (content) checks."""
import codecs
import os
from dataclasses import dataclass

# extension -> (category, content type)
ALLOWED: dict[str, tuple[str, str]] = {
    "pdf": ("documents", "application/pdf"),
    "doc": ("documents", "application/msword"),
    "docx": ("documents", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "xls": ("documents", "application/vnd.ms-excel"),
    "xlsx": ("documents", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "ppt": ("documents", "application/vnd.ms-powerpoint"),
    "pptx": ("documents", "application/vnd.openxmlformats-officedocument.presentationml.presentation"),
    "txt": ("documents", "text/plain; charset=utf-8"),
    "md": ("documents", "text/plain; charset=utf-8"),
    "csv": ("documents", "text/csv; charset=utf-8"),
    "json": ("documents", "application/json"),
    "png": ("images", "image/png"),
    "jpg": ("images", "image/jpeg"),
    "jpeg": ("images", "image/jpeg"),
    "gif": ("images", "image/gif"),
    "webp": ("images", "image/webp"),
    "mp4": ("videos", "video/mp4"),
    "mov": ("videos", "video/quicktime"),
    "webm": ("videos", "video/webm"),
    "zip": ("others", "application/zip"),
}

# Executables/scripts: rejected and reported as potential file threats.
DANGEROUS = {"exe", "dll", "bat", "cmd", "com", "scr", "msi", "ps1", "vbs", "js", "jar", "sh", "apk", "app",
             "html", "htm", "svg", "php", "py", "pif", "lnk"}

OLE = b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"
ZIP = (b"PK\x03\x04", b"PK\x05\x06")
SIGNATURES: dict[str, tuple[bytes, ...]] = {
    "pdf": (b"%PDF-",), "png": (b"\x89PNG\r\n\x1a\n",), "jpg": (b"\xff\xd8\xff",), "jpeg": (b"\xff\xd8\xff",),
    "gif": (b"GIF87a", b"GIF89a"), "docx": ZIP, "xlsx": ZIP, "pptx": ZIP, "zip": ZIP,
    "doc": (OLE,), "xls": (OLE,), "ppt": (OLE,), "webm": (b"\x1a\x45\xdf\xa3",),
}
TEXT_TYPES = {"txt", "md", "csv", "json"}


@dataclass
class ValidationResult:
    ok: bool
    reason: str = ""
    kind: str = ""          # 'policy' | 'threat'
    category: str = ""
    content_type: str = ""
    extension: str = ""


def sanitize_filename(name: str) -> str:
    name = os.path.basename((name or "").replace("\\", "/")).strip()
    name = "".join(ch for ch in name if ch.isprintable() and ch not in '<>:"|?*\x00')
    return (name or "file")[:200]


def validate_upload(filename: str, data: bytes, max_bytes: int) -> ValidationResult:
    name = sanitize_filename(filename)
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    if ext in DANGEROUS:
        return ValidationResult(False, f".{ext} files are blocked because they can run code.", "threat", extension=ext)
    if ext not in ALLOWED:
        return ValidationResult(False, f"File type .{ext or '(none)'} is not allowed.", "policy", extension=ext)
    if len(data) == 0:
        return ValidationResult(False, "The file is empty.", "policy", extension=ext)
    if len(data) > max_bytes:
        return ValidationResult(False, f"File is larger than the {max_bytes // (1024 * 1024)} MB limit.", "policy", extension=ext)

    head = data[:16]
    if ext in SIGNATURES and not any(head.startswith(sig) for sig in SIGNATURES[ext]):
        return ValidationResult(False, f"File content does not match its .{ext} extension.", "threat", extension=ext)
    if ext == "webp" and not (head[:4] == b"RIFF" and data[8:12] == b"WEBP"):
        return ValidationResult(False, "File content does not match its .webp extension.", "threat", extension=ext)
    if ext in ("mp4", "mov") and data[4:8] not in (b"ftyp", b"moov", b"mdat", b"wide", b"free", b"skip"):
        return ValidationResult(False, f"File content does not match its .{ext} extension.", "threat", extension=ext)
    if ext in TEXT_TYPES:
        sample = data[:65536]
        try:
            codecs.getincrementaldecoder("utf-8")().decode(sample, final=False)
        except UnicodeDecodeError:
            return ValidationResult(False, f"File is not valid UTF-8 text but has a .{ext} extension.", "threat", extension=ext)
        if b"\x00" in sample:
            return ValidationResult(False, f"File contains binary data but has a .{ext} extension.", "threat", extension=ext)

    category, content_type = ALLOWED[ext]
    return ValidationResult(True, category=category, content_type=content_type, extension=ext)
