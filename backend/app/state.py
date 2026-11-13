from .config import get_settings
from .services.encryption import KeyManager, EncryptionService
from .services.storage import build_storage

settings = get_settings()
key_manager = KeyManager(settings)
encryption = EncryptionService(key_manager)
_storage = None


def storage():
    global _storage
    if _storage is None:
        _storage = build_storage(settings)
    return _storage
