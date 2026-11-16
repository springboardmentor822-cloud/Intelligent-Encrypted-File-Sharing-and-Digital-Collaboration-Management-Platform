import os
import sys
import unittest
from unittest.mock import MagicMock, patch

# Add backend directory to sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.core.config import settings
from app.services.storage_service import StorageService
from app.services.encryption_service import EncryptionService


class TestMilestone2CloudStorage(unittest.TestCase):
    """
    Milestone 2 Task Two & Task Three Verification:
    - Verifies private storage vault / S3 integration
    - Ensures stored objects are strictly encrypted ciphertext
    - Validates retrieval, existence checks, and deletion
    """

    def setUp(self):
        StorageService.initialize()
        self.test_filename = "test_encrypted_doc.enc"
        self.test_plaintext = b"TrustShare Confidential Research Document - Milestone 2 Verification."
        # Encrypt the test payload
        self.enc_result = EncryptionService.encrypt_bytes(self.test_plaintext)
        self.ciphertext = self.enc_result["ciphertext"]

    def tearDown(self):
        # Cleanup any test artifacts
        test_path = os.path.join(StorageService.VAULT_DIR, self.test_filename)
        if os.path.exists(test_path):
            os.remove(test_path)

    def test_01_encrypted_payload_not_plaintext(self):
        """Verify that ciphertext stored in vault does not contain the readable plaintext."""
        self.assertNotIn(self.test_plaintext, self.ciphertext)
        self.assertNotEqual(self.ciphertext, self.test_plaintext)

    def test_02_local_vault_storage_operations(self):
        """Verify local vault save, exists, get, and delete operations."""
        # 1. Save
        storage_path = StorageService.save_encrypted_object(self.test_filename, self.ciphertext)
        self.assertTrue(os.path.exists(storage_path))
        self.assertTrue(StorageService.exists(storage_path))

        # 2. Get and verify ciphertext
        retrieved = StorageService.get_encrypted_object(storage_path)
        self.assertEqual(retrieved, self.ciphertext)

        # 3. Decrypt and verify original content
        decrypted = EncryptionService.decrypt_bytes(
            ciphertext=retrieved,
            nonce_b64=self.enc_result["nonce"],
            encrypted_dek_b64=self.enc_result["encrypted_dek"],
            dek_nonce_b64=self.enc_result["dek_nonce"],
            expected_sha256=self.enc_result["sha256_hash"],
        )
        self.assertEqual(decrypted, self.test_plaintext)

        # 4. Delete
        deleted = StorageService.delete_encrypted_object(storage_path)
        self.assertTrue(deleted)
        self.assertFalse(StorageService.exists(storage_path))

    @patch("boto3.client")
    def test_03_s3_cloud_storage_operations(self, mock_boto_client):
        """Verify AWS S3 cloud storage upload, retrieval, existence check, and deletion."""
        mock_s3 = MagicMock()
        mock_boto_client.return_value = mock_s3

        # Configure mock responses
        mock_s3.get_object.return_value = {
            "Body": MagicMock(read=MagicMock(return_value=self.ciphertext))
        }
        mock_s3.head_object.return_value = {"ContentLength": len(self.ciphertext)}

        with patch.object(settings, "STORAGE_BACKEND", "s3"), \
             patch.object(settings, "AWS_ACCESS_KEY_ID", "mock_key"), \
             patch.object(settings, "AWS_SECRET_ACCESS_KEY", "mock_secret"), \
             patch.object(settings, "AWS_S3_BUCKET", "trustshare-vault-test"):

            # Force re-initialization of singleton client
            StorageService._s3_client = mock_s3

            # 1. Save to S3
            s3_uri = StorageService.save_encrypted_object(self.test_filename, self.ciphertext)
            self.assertTrue(s3_uri.startswith("s3://trustshare-vault-test/encrypted_vault/"))
            mock_s3.put_object.assert_called_once()
            call_kwargs = mock_s3.put_object.call_args[1]
            self.assertEqual(call_kwargs["Bucket"], "trustshare-vault-test")
            self.assertEqual(call_kwargs["Body"], self.ciphertext)

            # 2. Exists in S3
            exists = StorageService.exists(s3_uri)
            self.assertTrue(exists)
            mock_s3.head_object.assert_called_with(
                Bucket="trustshare-vault-test",
                Key=f"encrypted_vault/{self.test_filename}"
            )

            # 3. Retrieve from S3
            retrieved_s3 = StorageService.get_encrypted_object(s3_uri)
            self.assertEqual(retrieved_s3, self.ciphertext)

            # 4. Delete from S3
            deleted_s3 = StorageService.delete_encrypted_object(s3_uri)
            self.assertTrue(deleted_s3)
            mock_s3.delete_object.assert_called_with(
                Bucket="trustshare-vault-test",
                Key=f"encrypted_vault/{self.test_filename}"
            )


if __name__ == "__main__":
    unittest.main(verbosity=2)

