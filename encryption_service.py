
import os
from dotenv import load_dotenv
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

load_dotenv()


def get_master_key() -> bytes:
    """Load the 256-bit master key from the backend .env file."""
    key_hex = os.getenv("TRUSTSHARE_MASTER_KEY", "")

    try:
        key = bytes.fromhex(key_hex)
    except ValueError as exc:
        raise ValueError("Master key must be valid hexadecimal.") from exc

    if len(key) != 32:
        raise ValueError("Master key must be exactly 32 bytes.")

    return key


def generate_key() -> bytes:
    """Generate a secure 256-bit file encryption key."""
    return AESGCM.generate_key(bit_length=256)


def encrypt_file(file_data: bytes, key: bytes) -> tuple[bytes, bytes]:
    """Encrypt file content using AES-256-GCM."""
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)
    encrypted_data = aesgcm.encrypt(nonce, file_data, None)
    return nonce, encrypted_data


def decrypt_file(
    nonce: bytes,
    encrypted_data: bytes,
    key: bytes,
) -> bytes:
    """Decrypt file content and verify its integrity."""
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, encrypted_data, None)


def wrap_file_key(file_key: bytes) -> tuple[bytes, bytes]:
    """Encrypt a file key using the master key."""
    master_key = get_master_key()
    nonce = os.urandom(12)
    wrapped_key = AESGCM(master_key).encrypt(nonce, file_key, None)
    return nonce, wrapped_key


def unwrap_file_key(
    nonce: bytes,
    wrapped_key: bytes,
) -> bytes:
    """Recover a file key using the master key."""
    master_key = get_master_key()
    return AESGCM(master_key).decrypt(nonce, wrapped_key, None)
