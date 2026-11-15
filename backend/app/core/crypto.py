"""AES-256-GCM envelope encryption.

How it works (envelope encryption):
  1. For every file we create a random 256-bit key called the DEK (Data Encryption Key).
  2. The file is encrypted with the DEK using AES-256-GCM.
  3. The DEK itself is encrypted ("wrapped") with a Master Key (KEK).
  4. We store: ciphertext (in storage) + nonce + wrapped DEK (in PostgreSQL).
  The plain DEK is never stored anywhere.

Key rotation: when the master key changes, we only re-wrap the small DEKs.
The big encrypted files do not need to be touched.
"""
import base64
import os
from dataclasses import dataclass

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


@dataclass
class EncryptedPayload:
    ciphertext: bytes      # encrypted file (GCM tag is included at the end)
    nonce_b64: str         # 12-byte nonce used for the file
    wrapped_dek_b64: str   # DEK encrypted by the master key (nonce + ciphertext)
    kek_version: str       # which master key wrapped the DEK, e.g. "v1"


def _file_aad(file_id: str) -> bytes:
    return f"file:{file_id}".encode()


def _dek_aad(file_id: str) -> bytes:
    return f"dek:{file_id}".encode()


class KeyManager:
    def __init__(self, keys: dict[str, bytes], current: str):
        if current not in keys:
            raise ValueError(f"Current master key version '{current}' not found in MASTER_KEYS")
        for version, key in keys.items():
            if len(key) != 32:
                raise ValueError(f"Master key {version} must be exactly 32 bytes (AES-256)")
        self.keys = keys
        self.current = current

    @classmethod
    def from_string(cls, raw: str, current: str) -> "KeyManager":
        keys: dict[str, bytes] = {}
        for part in raw.split(","):
            part = part.strip()
            if not part:
                continue
            version, _, b64 = part.partition(":")
            keys[version.strip()] = base64.b64decode(b64.strip())
        return cls(keys, current)

    # ---- wrapping / unwrapping the DEK ----
    def _wrap(self, dek: bytes, file_id: str, version: str) -> str:
        nonce = os.urandom(12)
        wrapped = AESGCM(self.keys[version]).encrypt(nonce, dek, _dek_aad(file_id))
        return base64.b64encode(nonce + wrapped).decode()

    def _unwrap(self, wrapped_b64: str, file_id: str, version: str) -> bytes:
        if version not in self.keys:
            raise ValueError(f"Master key version '{version}' is not configured")
        raw = base64.b64decode(wrapped_b64)
        nonce, wrapped = raw[:12], raw[12:]
        return AESGCM(self.keys[version]).decrypt(nonce, wrapped, _dek_aad(file_id))

    # ---- public API ----
    def encrypt_file(self, plaintext: bytes, file_id: str) -> EncryptedPayload:
        dek = AESGCM.generate_key(bit_length=256)  # random 256-bit key
        nonce = os.urandom(12)
        ciphertext = AESGCM(dek).encrypt(nonce, plaintext, _file_aad(file_id))
        return EncryptedPayload(
            ciphertext=ciphertext,
            nonce_b64=base64.b64encode(nonce).decode(),
            wrapped_dek_b64=self._wrap(dek, file_id, self.current),
            kek_version=self.current,
        )

    def decrypt_file(
        self, ciphertext: bytes, nonce_b64: str, wrapped_dek_b64: str, kek_version: str, file_id: str
    ) -> bytes:
        dek = self._unwrap(wrapped_dek_b64, file_id, kek_version)
        nonce = base64.b64decode(nonce_b64)
        # Raises cryptography.exceptions.InvalidTag if the data was modified
        return AESGCM(dek).decrypt(nonce, ciphertext, _file_aad(file_id))

    def rewrap_dek(self, wrapped_dek_b64: str, old_version: str, file_id: str) -> tuple[str, str]:
        """Re-encrypt the DEK with the current master key. Returns (new_wrapped, new_version)."""
        dek = self._unwrap(wrapped_dek_b64, file_id, old_version)
        return self._wrap(dek, file_id, self.current), self.current


_manager: KeyManager | None = None


def get_key_manager() -> KeyManager:
    global _manager
    if _manager is None:
        from app.core.config import settings

        _manager = KeyManager.from_string(settings.MASTER_KEYS, settings.MASTER_KEY_CURRENT)
    return _manager
