"""AES-256-GCM envelope encryption.

Each file gets its own random 256-bit data-encryption key (DEK) and 96-bit nonce.
The DEK is wrapped (AES-256-GCM) by a versioned key-encryption key (KEK) held by the
KeyManager. Only the wrapped DEK + KEK version are stored in the database.
The file id is bound as associated data, so ciphertext cannot be swapped between records.
"""
import base64, binascii, os, stat, json
from dataclasses import dataclass
from pathlib import Path
from cryptography.exceptions import InvalidTag
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from ..config import Settings


class DecryptionError(Exception):
    """Ciphertext failed authentication, key unavailable, or metadata malformed."""


@dataclass
class EncryptedBlob:
    ciphertext: bytes          # includes the 16-byte GCM tag
    nonce_b64: str
    wrapped_dek: str
    kek_version: int


class KeyManager:
    """Holds versioned KEKs. Development: env var or an auto-generated 0600 key file.
    Production: supply TS_MASTER_KEYS from a secret manager (or replace this class with a KMS client)."""

    def __init__(self, settings: Settings):
        self.settings = settings
        self.keys: dict[int, bytes] = {}
        self.active_version = settings.active_key_version
        self._load()

    def _load(self):
        raw = self.settings.master_keys.strip()
        if raw:
            for part in raw.split(","):
                v, k = part.strip().split(":", 1)
                key = base64.b64decode(k)
                if len(key) != 32:
                    raise RuntimeError(f"Master key v{v} must be 32 bytes (base64)")
                self.keys[int(v)] = key
        elif self.settings.is_prod:
            raise RuntimeError("TS_MASTER_KEYS must be set in production")
        else:
            p = Path(self.settings.data_dir) / "dev_master_keys.json"
            if p.exists():
                data = json.loads(p.read_text())
            else:
                data = {"1": base64.b64encode(os.urandom(32)).decode()}
                p.write_text(json.dumps(data))
                os.chmod(p, stat.S_IRUSR | stat.S_IWUSR)
            self.keys = {int(v): base64.b64decode(k) for v, k in data.items()}
            self.dev_key_file = p
        if self.active_version not in self.keys:
            self.active_version = max(self.keys)

    @property
    def mode(self) -> str:
        return "environment-supplied master keys" if self.settings.master_keys.strip() else "development key file (not for production)"

    def add_dev_key(self) -> int:
        """Development-only helper used by the rotation endpoint when no new key was provisioned."""
        if self.settings.is_prod or self.settings.master_keys.strip():
            raise RuntimeError("New KEK must be provisioned via TS_MASTER_KEYS and a restart")
        new_v = max(self.keys) + 1
        self.keys[new_v] = os.urandom(32)
        self.dev_key_file.write_text(json.dumps({str(v): base64.b64encode(k).decode() for v, k in self.keys.items()}))
        return new_v

    def wrap(self, dek: bytes, file_id: str, version: int | None = None) -> tuple[str, int]:
        v = version or self.active_version
        nonce = os.urandom(12)
        ct = AESGCM(self.keys[v]).encrypt(nonce, dek, f"dek:{file_id}".encode())
        return base64.b64encode(nonce + ct).decode(), v

    def unwrap(self, wrapped_b64: str, version: int, file_id: str) -> bytes:
        try:
            raw = base64.b64decode(wrapped_b64)
            return AESGCM(self.keys[version]).decrypt(raw[:12], raw[12:], f"dek:{file_id}".encode())
        except (KeyError, InvalidTag, binascii.Error, ValueError) as e:
            raise DecryptionError("data key could not be unwrapped") from e


class EncryptionService:
    def __init__(self, km: KeyManager):
        self.km = km

    def encrypt(self, plaintext: bytes, file_id: str) -> EncryptedBlob:
        dek = AESGCM.generate_key(bit_length=256)
        nonce = os.urandom(12)
        ct = AESGCM(dek).encrypt(nonce, plaintext, f"file:{file_id}".encode())
        wrapped, ver = self.km.wrap(dek, file_id)
        return EncryptedBlob(ct, base64.b64encode(nonce).decode(), wrapped, ver)

    def decrypt(self, ciphertext: bytes, *, file_id: str, nonce_b64: str, wrapped_dek: str, kek_version: int) -> bytes:
        dek = self.km.unwrap(wrapped_dek, kek_version, file_id)
        try:
            return AESGCM(dek).decrypt(base64.b64decode(nonce_b64), ciphertext, f"file:{file_id}".encode())
        except (InvalidTag, binascii.Error, ValueError) as e:
            raise DecryptionError("integrity verification failed") from e

    def rewrap(self, wrapped_dek: str, old_version: int, file_id: str) -> tuple[str, int]:
        """Key rotation: re-protect the DEK under the active KEK. File ciphertext is untouched."""
        return self.km.wrap(self.km.unwrap(wrapped_dek, old_version, file_id), file_id)
