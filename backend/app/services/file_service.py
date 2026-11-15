"""Shared helpers for reading + decrypting stored files."""
import hashlib
from collections.abc import Iterator
from urllib.parse import quote

from cryptography.exceptions import InvalidTag
from fastapi import HTTPException
from fastapi.responses import StreamingResponse

from app.core.crypto import get_key_manager
from app.core.storage import get_storage
from app.models.postgres import StoredFile


async def read_decrypted(f: StoredFile) -> bytes:
    """Fetch ciphertext from storage and decrypt it IN MEMORY. Nothing is written to disk."""
    ciphertext = await get_storage().get(f.storage_key)
    try:
        plaintext = get_key_manager().decrypt_file(ciphertext, f.nonce, f.wrapped_dek, f.kek_version, f.id)
    except InvalidTag:
        raise HTTPException(500, "Integrity check failed: the stored file was modified")
    if hashlib.sha256(plaintext).hexdigest() != f.sha256:
        raise HTTPException(500, "Integrity check failed: hash mismatch")
    return plaintext


def _chunks(data: bytes, size: int = 64 * 1024) -> Iterator[bytes]:
    for i in range(0, len(data), size):
        yield data[i:i + size]


def stream_response(data: bytes, filename: str, mime: str, inline: bool) -> StreamingResponse:
    disposition = "inline" if inline else "attachment"
    return StreamingResponse(
        _chunks(data),
        media_type=mime,
        headers={
            "Content-Disposition": f"{disposition}; filename*=UTF-8''{quote(filename)}",
            "Content-Length": str(len(data)),
            "X-Content-Type-Options": "nosniff",
            "Cache-Control": "no-store",
        },
    )
