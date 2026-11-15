import asyncio

import pytest

from app.core.storage import LocalStorage
from app.core.validation import UploadValidationError, sanitize_filename, validate_upload


def test_valid_pdf():
    name, mime = validate_upload("report.pdf", "application/pdf", b"%PDF-1.4 content")
    assert name == "report.pdf" and mime == "application/pdf"


def test_blocked_extension():
    with pytest.raises(UploadValidationError):
        validate_upload("virus.exe", "application/octet-stream", b"MZ....")


def test_fake_extension_detected_by_magic_bytes():
    with pytest.raises(UploadValidationError):
        validate_upload("photo.png", "image/png", b"this is not a png")


def test_empty_file_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload("a.txt", "text/plain", b"")


def test_binary_in_text_file_rejected():
    with pytest.raises(UploadValidationError):
        validate_upload("a.txt", "text/plain", b"abc\x00def")


def test_filename_sanitized():
    assert sanitize_filename("../../etc/passwd.txt") == "passwd.txt"
    assert "<" not in sanitize_filename("a<b>.txt")


def test_local_storage_roundtrip_and_traversal(tmp_path):
    async def run():
        s = LocalStorage(str(tmp_path))
        await s.put("u1/f1.enc", b"cipher")
        assert await s.get("u1/f1.enc") == b"cipher"
        await s.delete("u1/f1.enc")
        with pytest.raises(FileNotFoundError):
            await s.get("u1/f1.enc")
        with pytest.raises(ValueError):
            await s.put("../escape.txt", b"x")

    asyncio.run(run())
