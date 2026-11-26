import unittest
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.auth as auth
import app.routes_key_rotation as routes


class KeyRotationRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(routes.router)
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=1, role="super_admin")
        )

    def test_preview_returns_rotation_summary(self):
        preview = {
            "active_key_id": "test-key",
            "pending": 2,
            "rewrapped": 0,
        }

        with patch.object(routes, "rotate_file_keys", return_value=preview):
            with TestClient(self.app) as client:
                response = client.get("/admin/key-rotation/preview")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["mode"], "preview")
        self.assertEqual(response.json()["pending"], 2)

    def test_apply_requires_explicit_confirmation(self):
        with patch.object(routes, "rotate_file_keys") as rotate:
            with TestClient(self.app) as client:
                response = client.post(
                    "/admin/key-rotation/apply",
                    json={"confirm": False},
                )

        self.assertEqual(response.status_code, 400)
        rotate.assert_not_called()

    def test_apply_skips_when_no_files_are_pending(self):
        preview = {
            "active_key_id": "test-key",
            "pending": 0,
            "rewrapped": 0,
        }

        with patch.object(
            routes, "rotate_file_keys", return_value=preview
        ) as rotate:
            with TestClient(self.app) as client:
                response = client.post(
                    "/admin/key-rotation/apply",
                    json={"confirm": True},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["pending"], 0)
        self.assertEqual(rotate.call_count, 1)
        rotate.assert_called_once_with(apply=False)

    def test_apply_records_successful_rotation(self):
        preview = {
            "active_key_id": "test-key",
            "pending": 2,
            "rewrapped": 0,
        }
        result = {
            "active_key_id": "test-key",
            "pending": 2,
            "rewrapped": 2,
        }

        with (
            patch.object(
                routes, "rotate_file_keys", side_effect=[preview, result]
            ),
            patch.object(routes, "record_activity") as activity,
        ):
            with TestClient(self.app) as client:
                response = client.post(
                    "/admin/key-rotation/apply",
                    json={"confirm": True},
                )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["rewrapped"], 2)
        activity.assert_called_once()

    def test_preview_hides_internal_error_details(self):
        with patch.object(
            routes,
            "rotate_file_keys",
            side_effect=RuntimeError("sensitive internal detail"),
        ):
            with TestClient(self.app) as client:
                response = client.get("/admin/key-rotation/preview")

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sensitive internal detail", response.text)


    def test_regular_user_cannot_preview_rotation(self):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=2, role="user")
        )

        with patch.object(routes, "rotate_file_keys") as rotate:
            with TestClient(self.app) as client:
                response = client.get("/admin/key-rotation/preview")

        self.assertEqual(response.status_code, 403)
        rotate.assert_not_called()

    def test_apply_failure_returns_safe_error_and_records_failure(self):
        preview = {
            "active_key_id": "test-key",
            "pending": 1,
            "rewrapped": 0,
        }

        with (
            patch.object(
                routes,
                "rotate_file_keys",
                side_effect=[preview, RuntimeError("sensitive internal detail")],
            ),
            patch.object(routes, "record_activity") as activity,
        ):
            with TestClient(self.app) as client:
                response = client.post(
                    "/admin/key-rotation/apply",
                    json={"confirm": True},
                )

        self.assertEqual(response.status_code, 503)
        self.assertNotIn("sensitive internal detail", response.text)
        activity.assert_called_once()
        self.assertEqual(
            activity.call_args.args[0],
            "encryption_key_rotation_failed",
        )

if __name__ == "__main__":
    unittest.main()

