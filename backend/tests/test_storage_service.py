import unittest
from unittest.mock import Mock, patch

from fastapi import HTTPException
from azure.core.exceptions import ResourceNotFoundError

from app.services import storage_service


class AzureStorageServiceTests(unittest.TestCase):
    def setUp(self):
        self.blob = Mock()
        self.client_patch = patch.object(
            storage_service,
            "_azure_blob_client",
            return_value=self.blob,
        )
        self.client_patch.start()
        self.addCleanup(self.client_patch.stop)

        self.env_patch = patch.dict(
            "os.environ",
            {"AZURE_STORAGE_CONTAINER": "trustshare-test-container"},
        )
        self.env_patch.start()
        self.addCleanup(self.env_patch.stop)

    def test_upload_passes_encrypted_bytes_to_azure(self):
        payload = b"TSFILE01-encrypted-test-payload"

        storage_service.put_object(
            "tests/fake-object.bin", payload, "azure"
        )

        self.blob.upload_blob.assert_called_once_with(
            payload, overwrite=True
        )

    def test_download_returns_blob_bytes(self):
        self.blob.download_blob.return_value.readall.return_value = (
            b"encrypted-payload"
        )

        result = storage_service.get_object(
            "tests/fake-object.bin", "azure"
        )

        self.assertEqual(result, b"encrypted-payload")

    def test_exists_returns_true_when_properties_are_available(self):
        self.assertTrue(
            storage_service.object_exists(
                "tests/fake-object.bin", "azure"
            )
        )

    def test_exists_returns_false_when_blob_is_missing(self):
        self.blob.get_blob_properties.side_effect = (
            ResourceNotFoundError(message="missing test blob")
        )

        self.assertFalse(
            storage_service.object_exists(
                "tests/missing-object.bin", "azure"
            )
        )

    def test_object_length_returns_blob_size(self):
        self.blob.get_blob_properties.return_value.size = 123

        self.assertEqual(
            storage_service.object_length(
                "tests/fake-object.bin", "azure"
            ),
            123,
        )

    def test_delete_includes_snapshots(self):
        storage_service.delete_object(
            "tests/fake-object.bin", "azure"
        )

        self.blob.delete_blob.assert_called_once_with(
            delete_snapshots="include"
        )

    def test_deleting_missing_blob_is_safe(self):
        self.blob.delete_blob.side_effect = (
            ResourceNotFoundError(message="missing test blob")
        )

        storage_service.delete_object(
            "tests/missing-object.bin", "azure"
        )

    def test_upload_failure_becomes_service_unavailable(self):
        self.blob.upload_blob.side_effect = RuntimeError(
            "simulated Azure outage"
        )

        with self.assertRaises(HTTPException) as context:
            storage_service.put_object(
                "tests/fake-object.bin", b"encrypted", "azure"
            )

        self.assertEqual(context.exception.status_code, 503)

    def test_download_missing_blob_returns_not_found(self):
        self.blob.download_blob.side_effect = (
            ResourceNotFoundError(message="missing test blob")
        )

        with self.assertRaises(HTTPException) as context:
            storage_service.get_object(
                "tests/missing-object.bin", "azure"
            )

        self.assertEqual(context.exception.status_code, 404)

    def test_download_service_failure_returns_503(self):
        self.blob.download_blob.side_effect = RuntimeError(
            "simulated Azure outage"
        )

        with self.assertRaises(HTTPException) as context:
            storage_service.get_object(
                "tests/fake-object.bin", "azure"
            )

        self.assertEqual(context.exception.status_code, 503)

    def test_metadata_service_failure_returns_503(self):
        self.blob.get_blob_properties.side_effect = RuntimeError(
            "simulated Azure outage"
        )

        with self.assertRaises(HTTPException) as context:
            storage_service.object_length(
                "tests/fake-object.bin", "azure"
            )

        self.assertEqual(context.exception.status_code, 503)

    def test_delete_service_failure_returns_503(self):
        self.blob.delete_blob.side_effect = RuntimeError(
            "simulated Azure outage"
        )

        with self.assertRaises(HTTPException) as context:
            storage_service.delete_object(
                "tests/fake-object.bin", "azure"
            )

        self.assertEqual(context.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
