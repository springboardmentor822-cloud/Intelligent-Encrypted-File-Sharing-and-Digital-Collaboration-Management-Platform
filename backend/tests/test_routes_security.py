import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.auth as auth
import app.routes_security as routes_security
from app.models import StoredFile


class FakeStoredFileQuery:
    def __init__(self, legacy_count=0):
        self.legacy_count = legacy_count

    def filter(self, *_conditions):
        return self

    def count(self):
        return self.legacy_count


class FakeDatabase:
    def __init__(self, legacy_count=0):
        self.legacy_count = legacy_count

    def query(self, model):
        if model is not StoredFile:
            raise AssertionError("Unexpected database model")
        return FakeStoredFileQuery(self.legacy_count)


class SecurityStatusRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(routes_security.router)
        self.db = FakeDatabase()

        self.app.dependency_overrides[auth.get_db] = lambda: self.db

    def tearDown(self):
        self.app.dependency_overrides.clear()

    def authenticate(self, role="user"):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=1, role=role)
        )

    def test_security_status_requires_authentication(self):
        with TestClient(self.app) as client:
            response = client.get("/security/status")

        self.assertEqual(response.status_code, 401)

    def test_authenticated_user_receives_security_feature_statuses(self):
        self.authenticate()

        with (
            patch.object(routes_security, "keyring_configured", return_value=True),
            patch.dict(os.environ, {
                "FILE_STORAGE_BACKEND": "local",
                "GOOGLE_CLIENT_ID": "",
                "GOOGLE_CLIENT_SECRET": "",
                "MICROSOFT_CLIENT_ID": "",
                "MICROSOFT_CLIENT_SECRET": "",
            }, clear=False),
            TestClient(self.app) as client,
        ):
            response = client.get("/security/status")

        self.assertEqual(response.status_code, 200)

        features = response.json()["features"]

        expected_features = {
            "file_encryption",
            "cloud_storage",
            "https_tls",
            "jwt",
            "oauth",
            "rbac",
            "temporary_links",
            "download_tracking",
            "audit_logging",
            "secure_tokens",
            "key_rotation",
        }

        self.assertEqual(set(features), expected_features)
        self.assertEqual(features["file_encryption"]["status"], "Active")
        self.assertEqual(features["cloud_storage"]["status"], "Not selected")
        self.assertEqual(features["oauth"]["status"], "Configuration required")
        self.assertEqual(features["https_tls"]["status"], "Deployment dependent")

    def test_encryption_status_requires_keyring_configuration(self):
        self.authenticate()

        with (
            patch.object(routes_security, "keyring_configured", return_value=False),
            patch.dict(os.environ, {"FILE_STORAGE_BACKEND": "local"}, clear=False),
            TestClient(self.app) as client,
        ):
            response = client.get("/security/status")

        self.assertEqual(response.status_code, 200)
        encryption = response.json()["features"]["file_encryption"]
        self.assertEqual(encryption["status"], "Configuration required")

    def test_azure_status_reports_configuration_without_exposing_secrets(self):
        self.authenticate()

        with (
            patch.object(routes_security, "keyring_configured", return_value=True),
            patch.dict(os.environ, {
                "FILE_STORAGE_BACKEND": "azure",
                "AZURE_STORAGE_ACCOUNT_NAME": "test-account",
                "AZURE_STORAGE_CONTAINER": "test-container",
            }, clear=False),
            TestClient(self.app) as client,
        ):
            response = client.get("/security/status")

        self.assertEqual(response.status_code, 200)

        cloud = response.json()["features"]["cloud_storage"]
        self.assertIn(
            cloud["status"],
            {"Configured", "Dependency required"},
        )

        response_text = response.text.lower()
        self.assertNotIn("account_key", response_text)
        self.assertNotIn("connection_string", response_text)


if __name__ == "__main__":
    unittest.main()
