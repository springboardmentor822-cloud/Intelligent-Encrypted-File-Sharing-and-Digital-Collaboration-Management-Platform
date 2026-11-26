import os
import unittest
from unittest.mock import patch

from cryptography.fernet import Fernet

from app.services.encryption_service import (
    FileEncryptionError,
    decrypt_file,
    encrypt_file,
    rewrap_data_key,
)


class FileEncryptionTests(unittest.TestCase):
    def test_each_file_uses_distinct_dek_and_nonce_and_roundtrips(self):
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"FILE_KEY_ENCRYPTION_KEY": key}):
            first = encrypt_file(b"milestone two")
            second = encrypt_file(b"milestone two")
            self.assertNotEqual(first[0], second[0])
            self.assertNotEqual(first[1], second[1])
            self.assertEqual(decrypt_file(first[0], first[1], first[2]), b"milestone two")

    def test_tampered_ciphertext_fails_integrity_check(self):
        key = Fernet.generate_key().decode()
        with patch.dict(os.environ, {"FILE_KEY_ENCRYPTION_KEY": key}):
            blob, wrapped, key_id = encrypt_file(b"integrity matters")
            tampered = blob[:-1] + bytes([blob[-1] ^ 1])
            with self.assertRaises(FileEncryptionError):
                decrypt_file(tampered, wrapped, key_id)

    def test_dek_rewrap_preserves_decryption_during_key_rotation(self):
        old_key = Fernet.generate_key().decode()
        new_key = Fernet.generate_key().decode()
        initial_keyring = '{"old": "' + old_key + '"}'
        with patch.dict(os.environ, {
            "FILE_KEY_ENCRYPTION_KEYS": initial_keyring,
            "FILE_KEY_ENCRYPTION_ACTIVE_KEY_ID": "old",
        }, clear=False):
            blob, wrapped, old_id = encrypt_file(b"rotation-safe")
        keyring = '{"old": "' + old_key + '", "new": "' + new_key + '"}'
        with patch.dict(os.environ, {
            "FILE_KEY_ENCRYPTION_KEYS": keyring,
            "FILE_KEY_ENCRYPTION_ACTIVE_KEY_ID": "new",
        }, clear=False):
            rotated_wrapped, new_id = rewrap_data_key(wrapped, old_id)
            self.assertEqual(new_id, "new")
            self.assertEqual(decrypt_file(blob, rotated_wrapped, new_id), b"rotation-safe")


if __name__ == "__main__":
    unittest.main()
