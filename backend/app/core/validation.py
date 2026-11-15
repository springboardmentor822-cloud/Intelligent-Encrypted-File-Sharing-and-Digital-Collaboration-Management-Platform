"""File validation: extension allow-list, declared MIME type, magic bytes, safe filename."""
import os
import re

ALLOWED = {
    "pdf": "application/pdf",
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "gif": "image/gif",
    "txt": "text/plain",
    "csv": "text/csv",
    "doc": "application/msword",
    "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "xls": "application/vnd.ms-excel",
    "xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "ppt": "application/vnd.ms-powerpoint",
    "pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "mp4": "video/mp4",
    "mov": "video/quicktime",
    "webm": "video/webm",
}

# Browsers sometimes send these for the types above
ACCEPTED_CLIENT_TYPES = set(ALLOWED.values()) | {"application/octet-stream", "application/csv", "text/x-csv", ""}

ZIP = [b"PK\x03\x04"]
OLE = [b"\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1"]
MAGIC = {
    "pdf": [b"%PDF"],
    "png": [b"\x89PNG\r\n\x1a\n"],
    "jpg": [b"\xff\xd8\xff"],
    "jpeg": [b"\xff\xd8\xff"],
    "gif": [b"GIF87a", b"GIF89a"],
    "docx": ZIP, "xlsx": ZIP, "pptx": ZIP,
    "doc": OLE, "xls": OLE, "ppt": OLE,
    "webm": [b"\x1a\x45\xdf\xa3"],
}
# MP4 / MOV files carry the word "ftyp" at byte 4 instead of at the very start
FTYP_EXTENSIONS = {"mp4", "mov"}


# The EICAR test string is a harmless text that every antivirus treats as a virus. We block it too, which
# lets you DEMONSTRATE the "potential file threat" detection safely. (A real product would call an antivirus engine.)
EICAR = b"X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*"
EXECUTABLE_SIGNATURES = [b"MZ", b"\x7fELF"]  # Windows .exe/.dll and Linux programs


class UploadValidationError(Exception):
    """category tells the security monitor what kind of problem this was:
    "policy_violation" = broke an upload rule (type, size, empty)   "file_threat" = looks dangerous"""

    def __init__(self, message: str, category: str = "policy_violation"):
        super().__init__(message)
        self.category = category


def sanitize_filename(name: str) -> str:
    name = os.path.basename((name or "").replace("\\", "/"))
    name = re.sub(r"[\x00-\x1f<>:\"|?*]", "_", name).strip(". ")
    return name[:200]


def validate_upload(filename: str, content_type: str | None, data: bytes) -> tuple[str, str]:
    """Returns (clean_filename, mime_type) or raises UploadValidationError."""
    clean = sanitize_filename(filename)
    if not clean or "." not in clean:
        raise UploadValidationError("File must have a name and an extension")
    ext = clean.rsplit(".", 1)[1].lower()
    if ext not in ALLOWED:
        raise UploadValidationError(f"File type .{ext} is not allowed. Allowed: {', '.join(sorted(ALLOWED))}")
    ctype = (content_type or "").split(";")[0].strip().lower()
    if ctype not in ACCEPTED_CLIENT_TYPES:
        raise UploadValidationError(f"MIME type '{ctype}' is not allowed")
    if len(data) == 0:
        raise UploadValidationError("File is empty")
    if EICAR in data:
        raise UploadValidationError("Antivirus test signature detected", "file_threat")
    if any(data.startswith(sig) for sig in EXECUTABLE_SIGNATURES):
        raise UploadValidationError("Executable program disguised as a document", "file_threat")
    if ext in FTYP_EXTENSIONS:
        if data[4:8] != b"ftyp":
            raise UploadValidationError("File content does not match its extension", "file_threat")
    elif ext in MAGIC:
        if not any(data.startswith(sig) for sig in MAGIC[ext]):
            raise UploadValidationError("File content does not match its extension", "file_threat")
    elif b"\x00" in data[:8192]:  # txt / csv must be plain text
        raise UploadValidationError("Text file contains binary data", "file_threat")
    # We store OUR mime type (from the extension); we never trust the client's
    return clean, ALLOWED[ext]


def category_for_mime(mime: str) -> str:
    if mime.startswith("image/"):
        return "image"
    if mime.startswith("video/"):
        return "video"
    if mime == "application/pdf":
        return "pdf"
    if "word" in mime:
        return "document"
    if "excel" in mime or "spreadsheet" in mime or mime == "text/csv":
        return "spreadsheet"
    if "powerpoint" in mime or "presentation" in mime:
        return "presentation"
    if mime == "text/plain":
        return "text"
    return "other"


# The four groups used by the analytics charts (Documents / Images / Videos / Others)
CHART_GROUPS = {"pdf": "documents", "document": "documents", "spreadsheet": "documents", "presentation": "documents",
                "text": "documents", "image": "images", "video": "videos", "other": "others"}


def chart_group(mime: str) -> str:
    return CHART_GROUPS.get(category_for_mime(mime), "others")
