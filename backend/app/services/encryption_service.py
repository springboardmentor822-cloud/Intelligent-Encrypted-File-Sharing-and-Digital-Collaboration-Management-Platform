"""Versioned AES-256-GCM envelope encryption for stored file payloads."""

import json
import os

from cryptography.exceptions import InvalidTag
from cryptography.fernet import Fernet, InvalidToken
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


MAGIC = b"TSFILE01"
NONCE_SIZE = 12
KEY_SIZE = 32


class FileEncryptionError(Exception):
    """Raised when a file cannot be encrypted or authenticated on decrypt."""


class EncryptionConfigurationError(Exception):
    """Raised when the active key-encryption key is missing or invalid."""


def _keyring() -> tuple[str, dict[str, Fernet]]:
    serialized = os.getenv("FILE_KEY_ENCRYPTION_KEYS", "").strip()
    active_id = os.getenv("FILE_KEY_ENCRYPTION_ACTIVE_KEY_ID", "").strip()
    raw_keys: dict[str, str]
    if serialized:
        try:
            raw_keys = json.loads(serialized)
        except (TypeError, ValueError) as exc:
            raise EncryptionConfigurationError("FILE_KEY_ENCRYPTION_KEYS must be a JSON object.") from exc
        if not isinstance(raw_keys, dict) or not raw_keys:
            raise EncryptionConfigurationError("FILE_KEY_ENCRYPTION_KEYS must contain at least one key.")
        active_id = active_id or next(iter(raw_keys))
    else:
        raw_key = os.getenv("FILE_KEY_ENCRYPTION_KEY", "").strip()
        if not raw_key:
            raise EncryptionConfigurationError("Set FILE_KEY_ENCRYPTION_KEY before storing encrypted files.")
        active_id = active_id or "default"
        raw_keys = {active_id: raw_key}

    keys = {}
    for key_id, key_value in raw_keys.items():
        if not isinstance(key_id, str) or not key_id or not isinstance(key_value, str):
            raise EncryptionConfigurationError("Configured file encryption key entries are invalid.")
        try:
            keys[key_id] = Fernet(key_value.encode("ascii"))
        except (ValueError, UnicodeEncodeError) as exc:
            raise EncryptionConfigurationError("A configured file encryption key is invalid.") from exc
    if active_id not in keys:
        raise EncryptionConfigurationError("FILE_KEY_ENCRYPTION_ACTIVE_KEY_ID must name a configured key.")
    return active_id, keys


def keyring_configured() -> bool:
    try:
        _keyring()
        return True
    except EncryptionConfigurationError:
        return False


def rewrap_data_key(wrapped_dek: str, old_key_id: str | None) -> tuple[str, str]:
    """Rewrap a data key with the active KEK while leaving ciphertext unchanged."""
    active_id, keyring = _keyring()
    old_key = keyring.get(old_key_id or "default")
    if old_key is None:
        raise EncryptionConfigurationError("The prior file key must remain configured until rotation is complete.")
    try:
        dek = old_key.decrypt(wrapped_dek.encode("ascii"))
    except (InvalidToken, UnicodeEncodeError) as exc:
        raise FileEncryptionError("The stored data key could not be verified.") from exc
    if len(dek) != KEY_SIZE:
        raise FileEncryptionError("The stored data key has an invalid length.")
    return keyring[active_id].encrypt(dek).decode("ascii"), active_id


def encrypt_file(plaintext: bytes) -> tuple[bytes, str, str]:
    """Encrypt bytes using a fresh 256-bit DEK and nonce; return blob, wrapped DEK, key ID."""
    if not isinstance(plaintext, bytes):
        raise TypeError("File content must be bytes.")
    active_id, keyring = _keyring()
    dek = AESGCM.generate_key(bit_length=256)
    nonce = os.urandom(NONCE_SIZE)
    encrypted = AESGCM(dek).encrypt(nonce, plaintext, MAGIC)
    wrapped_dek = keyring[active_id].encrypt(dek).decode("ascii")
    return MAGIC + nonce + encrypted, wrapped_dek, active_id


def decrypt_file(blob: bytes, wrapped_dek: str, key_id: str | None) -> bytes:
    """Authenticate and decrypt a TrustShare file object."""
    try:
        _, keyring = _keyring()
        key = keyring.get(key_id or "default")
        if key is None:
            raise EncryptionConfigurationError("The key needed for this file is not configured.")
        dek = key.decrypt(wrapped_dek.encode("ascii"))
        if len(dek) != KEY_SIZE or len(blob) < len(MAGIC) + NONCE_SIZE + 16:
            raise FileEncryptionError("Encrypted file metadata is invalid.")
        if not blob.startswith(MAGIC):
            raise FileEncryptionError("Encrypted file format is not recognized.")
        nonce_start = len(MAGIC)
        nonce = blob[nonce_start:nonce_start + NONCE_SIZE]
        return AESGCM(dek).decrypt(nonce, blob[nonce_start + NONCE_SIZE:], MAGIC)
    except (InvalidTag, InvalidToken, UnicodeEncodeError, ValueError) as exc:
        raise FileEncryptionError("Encrypted file integrity verification failed.") from exc
