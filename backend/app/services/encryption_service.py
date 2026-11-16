import os
import base64
import hashlib
from typing import Optional, Tuple, Dict, Any
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes
from cryptography.exceptions import InvalidTag

from app.core.config import settings


class DecryptionError(Exception):
    """Raised when file decryption fails due to invalid key, tampered data, or corrupted tag."""
    pass


class EncryptionService:
    """
    Production-grade AES-256-GCM encryption service with Envelope Key Management.
    Complies with Milestone 2 cryptographic specifications:
    - Algorithm: AES-256-GCM (Galois/Counter Mode, authenticated encryption)
    - Key Size: 256 bits (32 bytes)
    - Nonce / IV: 96 bits (12 bytes) unique per encryption operation
    - Authentication Tag: 128 bits (16 bytes) verified automatically on decryption
    - Envelope Encryption: Per-file DEK (Data Encryption Key) protected by KEK (Key Encryption Key)
    """

    NONCE_SIZE_BYTES = 12   # Standard 96-bit nonce for AES-GCM
    KEY_SIZE_BITS = 256     # 256-bit encryption key
    KEY_SIZE_BYTES = 32     # 32 bytes

    _master_key_cache: Optional[bytes] = None

    @classmethod
    def get_master_key(cls) -> bytes:
        """
        Retrieves or derives the 256-bit Master Key (Key Encryption Key - KEK).
        If settings.MASTER_ENCRYPTION_KEY is provided in hex or base64, decodes it.
        Otherwise, deterministically derives a 256-bit KEK from SECRET_KEY using HKDF-SHA256.
        """
        if cls._master_key_cache is not None:
            return cls._master_key_cache

        raw_env_key = getattr(settings, "MASTER_ENCRYPTION_KEY", None)
        if raw_env_key:
            try:
                if len(raw_env_key) == 64:
                    key_bytes = bytes.fromhex(raw_env_key)
                else:
                    key_bytes = base64.b64decode(raw_env_key)
                if len(key_bytes) == cls.KEY_SIZE_BYTES:
                    cls._master_key_cache = key_bytes
                    return key_bytes
            except Exception:
                pass  # Fall through to HKDF derivation if env key was invalid

        # Secure HKDF (RFC 5869) key derivation from SECRET_KEY
        hkdf = HKDF(
            algorithm=hashes.SHA256(),
            length=cls.KEY_SIZE_BYTES,
            salt=b"TrustShare-KeyManagement-Salt-v1",
            info=b"TrustShare-Master-KEK-EnvelopeEncryption",
        )
        derived_key = hkdf.derive(settings.SECRET_KEY.encode("utf-8"))
        cls._master_key_cache = derived_key
        return derived_key

    @classmethod
    def generate_dek(cls) -> bytes:
        """Generates a cryptographically secure random 256-bit Data Encryption Key."""
        return AESGCM.generate_key(bit_length=cls.KEY_SIZE_BITS)

    @classmethod
    def generate_nonce(cls) -> bytes:
        """Generates a cryptographically secure 96-bit (12 bytes) unique nonce."""
        return os.urandom(cls.NONCE_SIZE_BYTES)

    @classmethod
    def wrap_dek(cls, dek: bytes, master_key: Optional[bytes] = None) -> Tuple[str, str]:
        """
        Envelope Key Wrapping: Encrypts the per-file DEK using the Master KEK with AES-256-GCM.
        Returns:
            (encrypted_dek_b64, dek_nonce_b64)
        """
        if master_key is None:
            master_key = cls.get_master_key()

        dek_nonce = cls.generate_nonce()
        kek_cipher = AESGCM(master_key)
        encrypted_dek = kek_cipher.encrypt(dek_nonce, dek, b"TrustShare-DEK-Envelope")

        return (
            base64.b64encode(encrypted_dek).decode("ascii"),
            base64.b64encode(dek_nonce).decode("ascii"),
        )

    @classmethod
    def unwrap_dek(cls, encrypted_dek_b64: str, dek_nonce_b64: str, master_key: Optional[bytes] = None) -> bytes:
        """
        Envelope Key Unwrapping: Decrypts the protected DEK using the Master KEK in-memory.
        Returns:
            Raw 32-byte DEK.
        Raises:
            DecryptionError if the Master Key or encrypted DEK payload was tampered with.
        """
        if master_key is None:
            master_key = cls.get_master_key()

        try:
            encrypted_dek = base64.b64decode(encrypted_dek_b64)
            dek_nonce = base64.b64decode(dek_nonce_b64)
            kek_cipher = AESGCM(master_key)
            dek = kek_cipher.decrypt(dek_nonce, encrypted_dek, b"TrustShare-DEK-Envelope")
            if len(dek) != cls.KEY_SIZE_BYTES:
                raise DecryptionError("Recovered key length is invalid (must be 256 bits).")
            return dek
        except InvalidTag:
            raise DecryptionError("Master Key verification failed: Key envelope has been tampered with or corrupted.")
        except Exception as e:
            if isinstance(e, DecryptionError):
                raise
            raise DecryptionError(f"Failed to unwrap encryption key: {str(e)}")

    @classmethod
    def calculate_sha256(cls, data: bytes) -> str:
        """Computes the SHA-256 digest of byte data for end-to-end integrity auditing."""
        hasher = hashlib.sha256()
        hasher.update(data)
        return hasher.hexdigest()

    @classmethod
    def encrypt_bytes(
        cls,
        data: bytes,
        associated_data: Optional[bytes] = None,
        custom_dek: Optional[bytes] = None,
    ) -> Dict[str, Any]:
        """
        Encrypts plaintext bytes with AES-256-GCM using a dedicated DEK.
        Wraps the DEK using Envelope Encryption with the Master KEK.

        Returns a dictionary with:
            - ciphertext (bytes): Encrypted data including 16-byte GCM authentication tag
            - nonce (str): Base64-encoded 12-byte nonce used for file encryption
            - encrypted_dek (str): Base64-encoded envelope-encrypted DEK
            - dek_nonce (str): Base64-encoded nonce used for wrapping DEK
            - sha256_hash (str): Hex-encoded SHA-256 digest of original plaintext
            - algorithm (str): "AES-256-GCM"
            - plaintext_size (int): Size in bytes of original data
            - ciphertext_size (int): Size in bytes of ciphertext (plaintext + 16-byte tag)
        """
        plaintext_size = len(data)
        sha256_hash = cls.calculate_sha256(data)

        # 1. Generate or use DEK
        dek = custom_dek or cls.generate_dek()

        # 2. Generate unique nonce for this file
        file_nonce = cls.generate_nonce()

        # 3. Encrypt data with AES-256-GCM (appends 16-byte authentication tag automatically)
        file_cipher = AESGCM(dek)
        ciphertext = file_cipher.encrypt(file_nonce, data, associated_data)

        # 4. Wrap DEK with Master KEK
        encrypted_dek_b64, dek_nonce_b64 = cls.wrap_dek(dek)

        return {
            "ciphertext": ciphertext,
            "nonce": base64.b64encode(file_nonce).decode("ascii"),
            "encrypted_dek": encrypted_dek_b64,
            "dek_nonce": dek_nonce_b64,
            "sha256_hash": sha256_hash,
            "algorithm": "AES-256-GCM",
            "plaintext_size": plaintext_size,
            "ciphertext_size": len(ciphertext),
        }

    @classmethod
    def decrypt_bytes(
        cls,
        ciphertext: bytes,
        nonce_b64: str,
        encrypted_dek_b64: str,
        dek_nonce_b64: str,
        associated_data: Optional[bytes] = None,
        expected_sha256: Optional[str] = None,
    ) -> bytes:
        """
        Decrypts ciphertext with AES-256-GCM in-memory.
        Verifies GCM authentication tag and optional SHA-256 checksum.

        Returns:
            Decrypted plaintext bytes.
        Raises:
            DecryptionError if key is wrong, data is tampered, or tag validation fails.
        """
        # 1. Unwrap DEK using Master KEK
        dek = cls.unwrap_dek(encrypted_dek_b64, dek_nonce_b64)

        # 2. Decode nonce
        try:
            file_nonce = base64.b64decode(nonce_b64)
        except Exception as e:
            raise DecryptionError(f"Invalid file nonce format: {str(e)}")

        # 3. Decrypt and verify authentication tag
        try:
            file_cipher = AESGCM(dek)
            plaintext = file_cipher.decrypt(file_nonce, ciphertext, associated_data)
        except InvalidTag:
            raise DecryptionError(
                "Integrity verification failed (AES-GCM InvalidTag). "
                "The file has been modified, tampered with, or corrupted."
            )
        except Exception as e:
            raise DecryptionError(f"Decryption failed: {str(e)}")

        # 4. Optional SHA-256 verification
        if expected_sha256:
            actual_sha256 = cls.calculate_sha256(plaintext)
            if actual_sha256.lower() != expected_sha256.lower():
                raise DecryptionError(
                    f"SHA-256 integrity mismatch. Expected {expected_sha256}, got {actual_sha256}."
                )

        return plaintext

