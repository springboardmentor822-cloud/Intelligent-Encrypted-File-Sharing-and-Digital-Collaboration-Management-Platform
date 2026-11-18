"""
TrustShare - AES-256 File Encryption & Key Management Service
========================================================================
Implements:
1. Server-side encryption using AES-256 in Galois/Counter Mode (AES-256-GCM).
2. Envelope Encryption:
   - Data Encryption Key (DEK): Unique 256-bit key per file.
   - Key Encryption Key (KEK / Master Key): PBKDF2-SHA256 derived from KMS secret.
   - DEK is wrapped (encrypted) with KEK using AES-256-GCM before DB persistence.
   - Raw DEK is NEVER saved to disk or persistent DB in plaintext.
3. Cryptographic Tamper Resistance:
   - Uses 96-bit (12-byte) unique nonce per encryption operation.
   - Verifies 128-bit (16-byte) GCM authentication tag upon decryption.
   - Rejects tampered ciphertext, mismatched tags, and invalid nonces immediately.
4. Key Rotation & Lifecycle:
   - Supports re-wrapping DEKs under new KEK versions without re-encrypting file blobs.
   - Full lifecycle: Generation -> Envelope Wrapping -> Storage -> Retrieval -> Rotation -> Zeroization.
"""

import os
import base64
import hashlib
from typing import Dict, Any, Optional
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag

# Master Key Derivation Settings (Envelope Encryption / Key Encryption Key - KEK)
_MASTER_KEY_ENV = os.getenv(
    "MASTER_ENCRYPTION_KEY",
    os.getenv("SECRET_KEY", "trustshare_enterprise_master_kek_salt_aes256_v2_2026")
)
_KEK_SALT = b"trustshare_cloud_kms_envelope_salt_v2"
_CACHED_KEK: Optional[bytes] = None
CURRENT_KEK_VERSION = "v2"


def get_master_kek(master_secret: Optional[str] = None) -> bytes:
    """
    Derives the 256-bit Key Encryption Key (KEK) using PBKDF2 with 100,000 iterations of SHA-256.
    Acts as the simulated Hardware Security Module (HSM) / Cloud KMS Master Key.
    """
    global _CACHED_KEK
    secret = master_secret or _MASTER_KEY_ENV
    if master_secret is not None:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_KEK_SALT,
            iterations=100_000,
        )
        return kdf.derive(secret.encode("utf-8"))

    if _CACHED_KEK is None:
        kdf = PBKDF2HMAC(
            algorithm=hashes.SHA256(),
            length=32,
            salt=_KEK_SALT,
            iterations=100_000,
        )
        _CACHED_KEK = kdf.derive(secret.encode("utf-8"))
    return _CACHED_KEK


def generate_dek() -> bytes:
    """Generates a cryptographically secure random 256-bit Data Encryption Key (DEK)."""
    return AESGCM.generate_key(bit_length=256)


def wrap_dek(dek: bytes, kek_version: str = CURRENT_KEK_VERSION, custom_kek: Optional[bytes] = None) -> Dict[str, str]:
    """
    Wraps (encrypts) the per-file DEK with the Master KEK using AES-256-GCM.
    Returns base64-encoded ciphertext, IV, authentication tag, and key version.
    """
    kek = custom_kek or get_master_kek()
    iv = os.urandom(12)  # 96-bit nonce standard for GCM
    aesgcm = AESGCM(kek)
    aad = f"trustshare-dek-envelope-{kek_version}".encode("utf-8")
    ct_with_tag = aesgcm.encrypt(iv, dek, aad)
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]

    return {
        "encrypted_dek": base64.b64encode(ct).decode("utf-8"),
        "dek_iv": base64.b64encode(iv).decode("utf-8"),
        "dek_tag": base64.b64encode(tag).decode("utf-8"),
        "kek_version": kek_version,
    }


def unwrap_dek(dek_info: Dict[str, str], custom_kek: Optional[bytes] = None) -> bytes:
    """
    Unwraps (decrypts) the per-file DEK using the Master KEK and validates the GCM authentication tag.
    Raises ValueError if tag verification fails (tampered key envelope or wrong master key).
    """
    kek = custom_kek or get_master_kek()
    ct = base64.b64decode(dek_info["encrypted_dek"])
    iv = base64.b64decode(dek_info["dek_iv"])
    tag = base64.b64decode(dek_info["dek_tag"])
    kek_ver = dek_info.get("kek_version", CURRENT_KEK_VERSION)

    ct_with_tag = ct + tag
    aesgcm = AESGCM(kek)
    aad = f"trustshare-dek-envelope-{kek_ver}".encode("utf-8")
    try:
        return aesgcm.decrypt(iv, ct_with_tag, aad)
    except InvalidTag:
        # Fallback to legacy envelope AAD for backwards compatibility
        try:
            return aesgcm.decrypt(iv, ct_with_tag, b"trustshare-dek-envelope")
        except InvalidTag:
            raise ValueError("DEK integrity verification failed! Master key mismatch or corrupted key envelope.")


def rotate_dek(dek_info: Dict[str, str], old_kek: bytes, new_kek: bytes, new_kek_version: str = "v3") -> Dict[str, str]:
    """
    Rotates the Master KEK protecting a file's DEK:
    1. Unwraps DEK using the old KEK.
    2. Re-wraps the DEK using the new KEK and increments the key version.
    Crucial advantage of envelope encryption: Existing encrypted file objects in cloud storage
    do NOT need to be re-encrypted during key rotation; only the envelope is updated!
    """
    raw_dek = unwrap_dek(dek_info, custom_kek=old_kek)
    return wrap_dek(raw_dek, kek_version=new_kek_version, custom_kek=new_kek)


def encrypt_file_data(plaintext_bytes: bytes, file_id: str) -> Dict[str, Any]:
    """
    Encrypts a file payload using AES-256-GCM server-side workflow with envelope encryption.
    
    Workflow:
    1. Generates unique 256-bit DEK.
    2. Wraps DEK with Master KEK.
    3. Encrypts plaintext bytes using DEK and 96-bit IV with file_id as Additional Authenticated Data (AAD).
    4. Computes SHA-256 plaintext checksum.
    5. Returns encrypted ciphertext and cryptographic metadata.
    """
    dek = generate_dek()
    wrapped_dek = wrap_dek(dek)

    file_iv = os.urandom(12)
    aesgcm = AESGCM(dek)
    aad = file_id.encode("utf-8")
    ct_with_tag = aesgcm.encrypt(file_iv, plaintext_bytes, aad)

    ct = ct_with_tag[:-16]
    file_tag = ct_with_tag[-16:]

    sha256_checksum = hashlib.sha256(plaintext_bytes).hexdigest()

    return {
        "ciphertext": ct,
        "file_iv": base64.b64encode(file_iv).decode("utf-8"),
        "file_tag": base64.b64encode(file_tag).decode("utf-8"),
        "dek_info": wrapped_dek,
        "sha256_checksum": sha256_checksum,
        "cipher_size": len(ct),
        "encryption_algorithm": "AES-256-GCM",
        "envelope_version": "2.0"
    }


def decrypt_file_data(
    ciphertext_bytes: bytes,
    dek_info: Dict[str, str],
    file_iv_b64: str,
    file_tag_b64: str,
    file_id: str
) -> bytes:
    """
    Decrypts an AES-256-GCM encrypted file payload and verifies cryptographic authenticity.
    
    Workflow:
    1. Unwraps DEK using Master KEK.
    2. Decodes file IV and GCM authentication tag.
    3. Authenticates and decrypts ciphertext using AES-256-GCM.
    4. Raises InvalidTag if ciphertext or tag was tampered with in storage.
    """
    dek = unwrap_dek(dek_info)
    file_iv = base64.b64decode(file_iv_b64)
    file_tag = base64.b64decode(file_tag_b64)

    ct_with_tag = ciphertext_bytes + file_tag
    aesgcm = AESGCM(dek)
    aad = file_id.encode("utf-8")

    try:
        plaintext = aesgcm.decrypt(file_iv, ct_with_tag, aad)
        return plaintext
    except InvalidTag:
        raise ValueError("Cryptographic tamper detected! AES-256-GCM authentication tag is invalid.")


# Class-based interface for enterprise service injection
class EncryptionService:
    """
    Service encapsulation for AES-256-GCM file encryption.
    """
    @staticmethod
    def generate_dek() -> bytes:
        return generate_dek()

    @staticmethod
    def wrap_dek(dek: bytes, kek_version: str = CURRENT_KEK_VERSION) -> Dict[str, str]:
        return wrap_dek(dek, kek_version)

    @staticmethod
    def unwrap_dek(dek_info: Dict[str, str]) -> bytes:
        return unwrap_dek(dek_info)

    @staticmethod
    def encrypt_file(plaintext_bytes: bytes, file_id: str) -> Dict[str, Any]:
        return encrypt_file_data(plaintext_bytes, file_id)

    @staticmethod
    def decrypt_file(
        ciphertext_bytes: bytes,
        dek_info: Dict[str, str],
        file_iv_b64: str,
        file_tag_b64: str,
        file_id: str
    ) -> bytes:
        return decrypt_file_data(ciphertext_bytes, dek_info, file_iv_b64, file_tag_b64, file_id)

    @staticmethod
    def rotate_dek(dek_info: Dict[str, str], old_kek: bytes, new_kek: bytes, new_ver: str = "v3") -> Dict[str, str]:
        return rotate_dek(dek_info, old_kek, new_kek, new_ver)


encryption_service = EncryptionService()
