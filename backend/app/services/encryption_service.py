"""AES-256-GCM file encryption.

Blob layout stored in object storage:   MAGIC(4) | nonce(12) | ciphertext | GCM tag(16)

* A fresh 256-bit data-encryption key (DEK) is generated for every file version.
* A fresh random 96-bit nonce is generated for every encryption operation.
* `aad` (associated data) binds the ciphertext to its database record (file id + version),
  so an object copied or swapped to another record fails authentication.
* GCM is an authenticated mode: any modification of the stored object is detected on decrypt.
"""
import os

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

MAGIC = b"TSv1"
NONCE_SIZE = 12
TAG_SIZE = 16
ALGORITHM = "AES-256-GCM"


class DecryptionError(Exception):
    """Raised when data is corrupted, tampered with, or the key/AAD is wrong."""


def generate_data_key() -> bytes:
    return AESGCM.generate_key(bit_length=256)


def build_aad(file_id, version: int) -> bytes:
    return f"{file_id}:{version}".encode()


def encrypt_bytes(plaintext: bytes, key: bytes, aad: bytes) -> bytes:
    if len(key) != 32:
        raise ValueError("AES-256 requires a 32-byte key")
    nonce = os.urandom(NONCE_SIZE)
    return MAGIC + nonce + AESGCM(key).encrypt(nonce, plaintext, aad)


def decrypt_bytes(blob: bytes, key: bytes, aad: bytes) -> bytes:
    if len(blob) < len(MAGIC) + NONCE_SIZE + TAG_SIZE or blob[: len(MAGIC)] != MAGIC:
        raise DecryptionError("Encrypted object has an invalid format")
    nonce = blob[len(MAGIC): len(MAGIC) + NONCE_SIZE]
    ciphertext = blob[len(MAGIC) + NONCE_SIZE:]
    try:
        return AESGCM(key).decrypt(nonce, ciphertext, aad)
    except InvalidTag as exc:
        raise DecryptionError("Integrity check failed: data was modified or the key is wrong") from exc
