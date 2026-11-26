import unittest
from unittest.mock import patch
from types import SimpleNamespace

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.pool import StaticPool
from sqlalchemy.orm import sessionmaker

import app.auth as auth
from app.database import Base
from app.models import PlatformSetting, User
from app.platform_settings import DEFAULT_ALLOWED_EXTENSIONS, deployment_limits
from app.platform_settings import save_platform_settings
from app.routes_platform_settings import router


class PlatformSettingsApiTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(self.engine)
        self.Session = sessionmaker(bind=self.engine, autoflush=False, autocommit=False)
        self.db = self.Session()
        self.user = SimpleNamespace(id=901, role="super_admin")
        self.db.add(User(id=901, full_name="Test Admin", email="platform-settings-admin@example.test", role="super_admin"))
        self.db.commit()
        self.app = FastAPI()
        self.app.include_router(router)
        self.app.dependency_overrides[auth.get_current_user] = lambda: self.user
        self.app.dependency_overrides[auth.get_db] = lambda: self.db

    def tearDown(self):
        self.db.close()
        Base.metadata.drop_all(self.engine)
        self.engine.dispose()

    def test_settings_update_persists_and_get_does_not_expose_secrets(self):
        limits = deployment_limits()
        upload_limit = max(1_048_576, limits["max_upload_size_bytes"] - 1_048_576)
        quota_limit = max(1_048_576, limits["per_user_storage_quota_bytes"] - 1_048_576)
        attempts_limit = max(1, limits["auth_rate_limit_attempts"] - 1)
        allowed = limits["allowed_file_extensions"][:1]

        with patch("app.routes_platform_settings.get_system_health", return_value={"services": {"mysql": "healthy", "mongodb": "healthy", "redis": "healthy"}}), \
                patch("app.routes_platform_settings.keyring_configured", return_value=True), \
                patch("app.routes_platform_settings.record_activity"):
            with TestClient(self.app) as client:
                updated = client.patch("/admin/settings", json={
                    "max_upload_size_bytes": upload_limit,
                    "per_user_storage_quota_bytes": quota_limit,
                    "auth_rate_limit_attempts": attempts_limit,
                    "allowed_file_extensions": allowed,
                })
                self.assertEqual(updated.status_code, 200, updated.text)

                self.db.close()
                self.db = self.Session()
                loaded = client.get("/admin/settings")
                self.assertEqual(loaded.status_code, 200, loaded.text)
                body = loaded.json()
                self.assertEqual(body["settings"]["max_upload_size_bytes"], upload_limit)
                self.assertEqual(body["settings"]["per_user_storage_quota_bytes"], quota_limit)
                self.assertEqual(body["settings"]["auth_rate_limit_attempts"], attempts_limit)
                self.assertEqual(body["settings"]["allowed_file_extensions"], allowed)
                self.assertNotIn("SMTP_PASSWORD", body)
                self.assertNotIn("FILE_KEY_ENCRYPTION_KEY", body)
                self.assertEqual(self.db.query(PlatformSetting).count(), 4)

    def test_settings_reject_values_above_deployment_security_ceilings(self):
        limits = deployment_limits()
        with patch("app.routes_platform_settings.get_system_health", return_value={"services": {"mysql": "healthy"}}), \
                patch("app.routes_platform_settings.record_activity"):
            with TestClient(self.app) as client:
                response = client.patch("/admin/settings", json={
                    "auth_rate_limit_attempts": limits["auth_rate_limit_attempts"] + 1,
                })
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(PlatformSetting).count(), 0)

    def test_settings_cannot_expand_the_deployment_file_type_allowlist(self):
        unsupported = next(extension for extension in (".exe", ".bat", ".ps1") if extension not in DEFAULT_ALLOWED_EXTENSIONS)
        with patch("app.routes_platform_settings.get_system_health", return_value={"services": {"mysql": "healthy"}}), \
                patch("app.routes_platform_settings.record_activity"):
            with TestClient(self.app) as client:
                response = client.patch("/admin/settings", json={"allowed_file_extensions": [unsupported]})
        self.assertEqual(response.status_code, 422)
        self.assertEqual(self.db.query(PlatformSetting).count(), 0)

    def test_auth_attempt_limit_can_be_tightened_but_not_raised_again(self):
        ceiling = deployment_limits()["auth_rate_limit_attempts"]
        if ceiling < 2:
            self.skipTest("The deployment already has the minimum allowed attempt limit.")
        with patch("app.routes_platform_settings.get_system_health", return_value={"services": {"mysql": "healthy"}}), \
                patch("app.routes_platform_settings.record_activity"):
            with TestClient(self.app) as client:
                lower = client.patch("/admin/settings", json={"auth_rate_limit_attempts": ceiling - 1})
                self.assertEqual(lower.status_code, 200, lower.text)
                raise_again = client.patch("/admin/settings", json={"auth_rate_limit_attempts": ceiling})
        self.assertEqual(raise_again.status_code, 422)
        self.assertEqual(self.db.query(PlatformSetting).filter(PlatformSetting.setting_key == "auth_rate_limit_attempts").first().value_json, str(ceiling - 1))

    def test_non_super_admin_cannot_read_or_update_settings(self):
        self.user = SimpleNamespace(id=902, role="user")
        with patch("app.routes_platform_settings.get_system_health", return_value={"services": {"mysql": "healthy"}}):
            with TestClient(self.app) as client:
                self.assertEqual(client.get("/admin/settings").status_code, 403)
                self.assertEqual(client.patch("/admin/settings", json={"auth_rate_limit_attempts": 1}).status_code, 403)
        self.assertEqual(self.db.query(PlatformSetting).count(), 0)

    def test_attempt_limit_setting_is_used_by_authentication_rate_limiter(self):
        import app.rate_limit as rate_limit

        save_platform_settings(self.db, {"auth_rate_limit_attempts": 1}, self.user.id)

        class FakeRedis:
            def incr(self, _key):
                return 2

            def expire(self, _key, _seconds):
                return True

        request = SimpleNamespace(client=SimpleNamespace(host="192.0.2.10"))
        with patch("app.platform_settings.SettingsSession", return_value=self.db), \
                patch.object(rate_limit, "redis_client", FakeRedis()), \
                patch.object(rate_limit, "record_activity"):
            with self.assertRaises(HTTPException) as context:
                rate_limit.enforce_auth_rate_limit("login", request)
        self.assertEqual(context.exception.status_code, 429)


if __name__ == "__main__":
    unittest.main()
