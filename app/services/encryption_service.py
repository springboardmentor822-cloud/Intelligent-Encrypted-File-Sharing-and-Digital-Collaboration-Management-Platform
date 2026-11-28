
import os
from cryptography.hazmat.primitives.ciphers.aead import AESGCM

from .key_management_service import KeyManagementService


class EncryptionService:
    """
    AES-256-GCM encryption with versioned envelope key management.
    """

    @staticmethod
    def generate_key() -> bytes:
        return AESGCM.generate_key(bit_length=256)

    @staticmethod
    def encrypt_file(file_data: bytes, key: bytes) -> dict:
        if len(key) != 32:
            raise ValueError("AES-256 requires a 32-byte key.")

        nonce = os.urandom(12)

        encrypted_data = AESGCM(key).encrypt(
            nonce, file_data, None
        )

        return {
            "encrypted_data": encrypted_data,
            "nonce": nonce
        }

    @staticmethod
    def decrypt_file(
        encrypted_data: bytes,
        key: bytes,
        nonce: bytes
    ) -> bytes:
        if len(key) != 32:
            raise ValueError("AES-256 requires a 32-byte key.")

        if len(nonce) != 12:
            raise ValueError("AES-GCM requires a 12-byte nonce.")

        return AESGCM(key).decrypt(
            nonce, encrypted_data, None
        )

    @staticmethod
    def encrypt_and_wrap(file_data: bytes) -> dict:
        """Encrypt file and wrap its DEK using active master key."""

        data_key = KeyManagementService.generate_data_key()

        encrypted = EncryptionService.encrypt_file(
            file_data, data_key
        )

        wrapped = KeyManagementService.wrap_data_key(data_key)

        return {
            "encrypted_data": encrypted["encrypted_data"],
            "nonce": encrypted["nonce"],
            "wrapped_key": wrapped["wrapped_key"],
            "key_nonce": wrapped["key_nonce"],
            "key_version": wrapped["key_version"]
        }

    @staticmethod
    def unwrap_and_decrypt(
        encrypted_data: bytes,
        nonce: bytes,
        wrapped_key: bytes,
        key_nonce: bytes,
        key_version: int = 1
    ) -> bytes:
        """Unwrap DEK with its original key version and decrypt file."""

        data_key = KeyManagementService.unwrap_data_key(
            wrapped_key,
            key_nonce,
            key_version
        )

        return EncryptionService.decrypt_file(
            encrypted_data,
            data_key,
            nonce
        )
