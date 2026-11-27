"""Envelope-encryption key management.

    plaintext file --AES-256-GCM(DEK)--> encrypted object  (object storage)
    DEK            --wrap(KEK)---------> wrapped_dek        (PostgreSQL)

* DEK: random per-file-version data key. Never stored in clear, never sent to a client, never logged.
* KEK: master key. Either a local AES-256 key from the environment (versioned, rotatable) or AWS KMS.
* Rotation re-wraps DEKs under the new KEK; the (large) encrypted files are not touched.
"""
import base64
import os
from abc import ABC, abstractmethod

from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class KeyError_(Exception):
    pass


class KeyProvider(ABC):
    name: str

    @property
    @abstractmethod
    def active_version(self) -> str: ...

    @abstractmethod
    def wrap(self, dek: bytes, context: str) -> tuple[bytes, str]:
        """Return (wrapped_dek, kek_version)."""

    @abstractmethod
    def unwrap(self, wrapped: bytes, version: str, context: str) -> bytes: ...

    def rewrap(self, wrapped: bytes, old_version: str, context: str) -> tuple[bytes, str]:
        dek = self.unwrap(wrapped, old_version, context)
        return self.wrap(dek, context)


class LocalKeyProvider(KeyProvider):
    name = "local"

    def __init__(self, keys: dict[int, bytes], active: int):
        if active not in keys:
            raise KeyError_(f"Active key version {active} is not present in MASTER_KEYS")
        self._keys = keys
        self._active = active

    @property
    def active_version(self) -> str:
        return str(self._active)

    def wrap(self, dek: bytes, context: str) -> tuple[bytes, str]:
        nonce = os.urandom(12)
        ct = AESGCM(self._keys[self._active]).encrypt(nonce, dek, b"dek:" + context.encode())
        return nonce + ct, str(self._active)

    def unwrap(self, wrapped: bytes, version: str, context: str) -> bytes:
        try:
            kek = self._keys[int(version)]
        except (KeyError, ValueError):
            raise KeyError_(f"Master key version {version} is not available") from None
        try:
            return AESGCM(kek).decrypt(wrapped[:12], wrapped[12:], b"dek:" + context.encode())
        except InvalidTag as exc:
            raise KeyError_("Could not unwrap data key (wrong master key or modified record)") from exc


class KmsKeyProvider(KeyProvider):
    """AWS KMS provider. The master key never leaves KMS; rotation is handled by KMS itself."""

    name = "aws_kms"

    def __init__(self, key_id: str, region: str | None = None):
        import boto3

        self._client = boto3.client("kms", region_name=region or None)
        self._key_id = key_id

    @property
    def active_version(self) -> str:
        return "kms"

    def wrap(self, dek: bytes, context: str) -> tuple[bytes, str]:
        resp = self._client.encrypt(KeyId=self._key_id, Plaintext=dek, EncryptionContext={"ref": context})
        return resp["CiphertextBlob"], "kms"

    def unwrap(self, wrapped: bytes, version: str, context: str) -> bytes:
        resp = self._client.decrypt(CiphertextBlob=wrapped, EncryptionContext={"ref": context})
        return resp["Plaintext"]


_provider: KeyProvider | None = None


def get_key_provider() -> KeyProvider:
    global _provider
    if _provider is None:
        from app.core.config import settings

        if settings.key_provider == "aws_kms":
            _provider = KmsKeyProvider(settings.kms_key_id, settings.kms_region)
        else:
            _provider = LocalKeyProvider(settings.master_key_map, settings.active_key_version)
    return _provider


# ---- Small secrets (e.g. TOTP seeds) are protected with the same master key ----
def protect_secret(value: str, provider: KeyProvider | None = None) -> str:
    provider = provider or get_key_provider()
    wrapped, version = provider.wrap(value.encode(), "secret")
    return f"{version}:{base64.b64encode(wrapped).decode()}"


def reveal_secret(stored: str, provider: KeyProvider | None = None) -> str:
    provider = provider or get_key_provider()
    version, _, b64 = stored.partition(":")
    return provider.unwrap(base64.b64decode(b64), version, "secret").decode()
