
import os
import base64
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class KeyManagementService:
    """
    Envelope encryption:
    DEK = Data Encryption Key (per file)
    KEK = Key Encryption Key (master key)
    """

    @staticmethod
    def get_master_key(version: int = None) -> bytes:
        """Load a versioned 256-bit master key."""

        current_version = int(
            os.getenv("TRUSTSHARE_MASTER_KEY_VERSION", "1")
        )

        if version is None:
            version = current_version

        if version == 1:
            env_key = "TRUSTSHARE_MASTER_KEY"
        elif version == 2:
            env_key = "TRUSTSHARE_MASTER_KEY_V2"
        else:
            raise ValueError(
                f"Master key version {version} is not supported."
            )

        encoded_key = os.getenv(env_key)

        if not encoded_key:
            raise ValueError(
                f"{env_key} is not configured."
            )

        try:
            master_key = base64.b64decode(
                encoded_key,
                validate=True
            )
        except Exception as exc:
            raise ValueError(
                f"Invalid {env_key} format."
            ) from exc

        if len(master_key) != 32:
            raise ValueError(
                "Master key must be exactly 32 bytes."
            )

        return master_key

    @staticmethod
    def generate_data_key() -> bytes:
        """Generate a unique 256-bit key for a file."""

        return AESGCM.generate_key(bit_length=256)

    @staticmethod
    def wrap_data_key(data_key: bytes, version: int = None) -> dict:
        """Wrap a DEK using an explicitly selected master key version."""

        if len(data_key) != 32:
            raise ValueError("Data key must be 32 bytes.")

        if version is None:
            version = int(
                os.getenv("TRUSTSHARE_MASTER_KEY_VERSION", "1")
            )

        master_key = KeyManagementService.get_master_key(
            version=version
        )

        nonce = os.urandom(12)

        wrapped_key = AESGCM(master_key).encrypt(
            nonce,
            data_key,
            None
        )

        return {
            "wrapped_key": wrapped_key,
            "key_nonce": nonce,
            "key_version": version
        }

    @staticmethod
    def unwrap_data_key(
        wrapped_key: bytes,
        key_nonce: bytes,
        key_version: int = 1
    ) -> bytes:
        """Recover the original DEK using its master key version."""

        if len(key_nonce) != 12:
            raise ValueError(
                "AES-GCM requires a 12-byte nonce."
            )

        master_key = KeyManagementService.get_master_key(
            version=key_version
        )

        return AESGCM(master_key).decrypt(
            key_nonce,
            wrapped_key,
            None
        )

    @staticmethod
    def rewrap_data_key(
        wrapped_key: bytes,
        key_nonce: bytes,
        source_version: int,
        target_version: int
    ) -> dict:
        """Re-wrap the same DEK with a new master key."""

        data_key = KeyManagementService.unwrap_data_key(
            wrapped_key=wrapped_key,
            key_nonce=key_nonce,
            key_version=source_version
        )

        return KeyManagementService.wrap_data_key(
            data_key=data_key,
            version=target_version
        )
