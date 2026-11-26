
import unittest
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient

import app.auth as auth
import app.activity as activity
import app.routes_admin as routes_admin
import app.routes_monitoring as routes_monitoring


class AdminRouteTests(unittest.TestCase):
    def setUp(self):
        self.app = FastAPI()
        self.app.include_router(routes_admin.router)
        self.app.include_router(routes_monitoring.router)

    def test_admin_routes_reject_non_super_admin(self):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=8, role="user")
        )

        with patch.object(auth, "record_activity"):
            with TestClient(self.app) as client:
                response = client.get("/admin/system-health")

        self.assertEqual(response.status_code, 403)

    def test_system_health_reports_each_real_service_check(self):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=1, role="super_admin")
        )

        @contextmanager
        def healthy_connection():
            yield SimpleNamespace(execute=lambda _query: None)

        with (
            patch.object(
                routes_admin.mysql_engine,
                "connect",
                healthy_connection,
            ),
            patch.object(
                type(routes_admin.mongo_client.admin),
                "command",
                return_value={"ok": 1},
            ),
            patch.object(
                routes_admin.redis_client,
                "ping",
                return_value=True,
            ),
        ):
            with TestClient(self.app) as client:
                response = client.get("/admin/system-health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(
            response.json()["services"],
            {
                "mysql": "healthy",
                "mongodb": "healthy",
                "redis": "healthy",
            },
        )
        self.assertIn("checked_at", response.json())

    def test_system_health_marks_failed_check_unavailable(self):
        with (
            patch.object(
                routes_admin.mysql_engine,
                "connect",
                side_effect=RuntimeError(
                    "connection detail must not escape"
                ),
            ),
            patch.object(
                type(routes_admin.mongo_client.admin),
                "command",
                return_value={"ok": 1},
            ),
            patch.object(
                routes_admin.redis_client,
                "ping",
                return_value=True,
            ),
        ):
            result = routes_admin.get_system_health()

        self.assertEqual(
            result["services"]["mysql"],
            "unavailable",
        )
        self.assertNotIn("connection detail", str(result))

    def test_file_listing_returns_safe_metadata_and_applies_pagination(self):
        file = SimpleNamespace(
            id=12,
            original_name="report.pdf",
            stored_name="internal-secret-name",
            content_type="application/pdf",
            size_bytes=240,
            owner_id=4,
            folder_id=7,
            created_at="2026-10-22T10:00:00",
            password_hash="must-not-be-returned",
        )
        owner = SimpleNamespace(
            id=4,
            full_name="Owner",
            email="owner@example.test",
        )

        class Query:
            def join(self, *_args):
                return self

            def filter(self, *_args):
                return self

            def count(self):
                return 1

            def order_by(self, *_args):
                return self

            def offset(self, value):
                self.start = value
                return self

            def limit(self, value):
                self.page_size = value
                return self

            def all(self):
                return [(file, owner)]

        result = routes_admin.list_platform_files(
            search="report",
            limit=5,
            offset=0,
            db=SimpleNamespace(
                query=lambda *_args: Query()
            ),
        )

        self.assertEqual(result["total"], 1)
        self.assertEqual(
            result["files"][0]["owner_email"],
            "owner@example.test",
        )
        self.assertNotIn("stored_name", result["files"][0])
        self.assertNotIn("password_hash", result["files"][0])

    def test_sharing_report_serializes_file_and_folder_statuses(self):
        owner = SimpleNamespace(
            id=4,
            full_name="Owner",
            email="owner@example.test",
        )
        file_share = SimpleNamespace(
            id=1,
            revoked=False,
            email_status="failed",
            expires_at=datetime.now(timezone.utc) + timedelta(days=1),
            recipient_email="a@example.test",
            permission="download",
            created_at="2026-10-22T10:00:00",
        )
        file = SimpleNamespace(original_name="report.pdf")

        folder_share = SimpleNamespace(
            id=2,
            revoked=False,
            expires_at=None,
            recipient_email="b@example.test",
            permission="viewer",
            email_status="uncertain",
            email_attempt_count=3,
            email_attempted_at="2026-10-22T11:01:00",
            email_sent_at=None,
            email_error_category="ambiguous_delivery",
            created_at="2026-10-22T11:00:00",
        )
        folder = SimpleNamespace(name="Project")

        class Query:
            def __init__(self, rows):
                self.rows = rows

            def join(self, *_args):
                return self

            def all(self):
                return self.rows

        queries = iter([
            Query([(file_share, file, owner)]),
            Query([(folder_share, folder, owner)]),
        ])

        result = routes_admin.get_sharing_reports(
            search=None,
            status=None,
            limit=200,
            offset=0,
            db=SimpleNamespace(
                query=lambda *_args: next(queries)
            ),
        )

        by_kind = {
            row["kind"]: row
            for row in result["shares"]
        }

        self.assertEqual(result["total"], 2)
        self.assertEqual(by_kind["file"]["status"], "active")
        self.assertEqual(by_kind["file"]["email_status"], "failed")
        self.assertIsNotNone(by_kind["file"]["expires_at"])
        self.assertEqual(by_kind["folder"]["status"], "active")
        self.assertEqual(by_kind["folder"]["email_status"], "uncertain")
        self.assertEqual(by_kind["folder"]["email_attempt_count"], 3)
        self.assertNotIn("share_token", by_kind["file"])

    def test_audit_logs_reject_non_super_admin(self):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=8, role="user")
        )

        with TestClient(self.app) as client:
            response = client.get("/admin/audit-logs")

        self.assertEqual(response.status_code, 403)

    def test_audit_logs_apply_filters_and_pagination(self):
        event = {
            "log_id": "audit-1",
            "activity_type": "login_failed",
            "activity_status": "failed",
            "activity_description": "Invalid password",
            "user_id": 7,
            "secret_token": "must-not-be-returned",
        }

        class FakeCursor:
            def __init__(self, events):
                self.events = events
                self.sort_args = None
                self.offset = 0
                self.page_size = None

            def sort(self, field, direction):
                self.sort_args = (field, direction)
                return self

            def skip(self, offset):
                self.offset = offset
                return self

            def limit(self, limit):
                self.page_size = limit
                return self

            def __iter__(self):
                return iter(self.events[self.offset:
                                        self.offset + self.page_size])

        class FakeCollection:
            def __init__(self, events):
                self.events = events
                self.query = None
                self.projection = None
                self.cursor = FakeCursor(events)

            def find(self, query, projection):
                self.query = query
                self.projection = projection
                return self.cursor

        collection = FakeCollection([event])

        fake_mongo = {activity.AUDIT_COLLECTION: collection}

        with patch.object(activity, "mongo_db", fake_mongo):
            result = routes_admin.list_audit_logs(
                limit=10,
                offset=0,
                event_type="login_failed",
                user_id=7,
                file_id=12,
                status="failed",
                start_date="2026-10-01",
                end_date="2026-10-31",
                search="Invalid password",
            )

        self.assertEqual(
            collection.query["activity_type"],
            "login_failed",
        )
        self.assertEqual(collection.query["user_id"], 7)
        self.assertEqual(collection.query["file_id"], 12)
        self.assertEqual(collection.query["created_at"]["$gte"], datetime(2026, 10, 1, tzinfo=timezone.utc))
        self.assertEqual(collection.query["created_at"]["$lt"], datetime(2026, 11, 1, tzinfo=timezone.utc))
        self.assertEqual(
            collection.query["$and"][1]["$or"][1]["activity_description"]["$regex"],
            "Invalid\\ password",
        )
        self.assertEqual(collection.query["$and"][0]["$or"][0], {"activity_status": "failed"})
        self.assertEqual(collection.projection, {"_id": 0})
        self.assertEqual(collection.cursor.sort_args, ("created_at", -1))
        self.assertEqual(collection.cursor.offset, 0)
        self.assertEqual(collection.cursor.page_size, 10)
        self.assertEqual(result["count"], 1)
        self.assertEqual(result["limit"], 10)
        self.assertEqual(result["offset"], 0)

    def test_audit_logs_return_only_allowlisted_fields(self):
        event = {
            "_id": "internal-mongo-id",
            "log_id": "audit-2",
            "activity_type": "file_download_success",
            "activity_status": "success",
            "activity_description": "Download completed",
            "user_id": 7,
            "secret_token": "must-not-be-returned",
            "wrapped_data_key": "must-not-be-returned",
        }

        class FakeCursor:
            def sort(self, *_args):
                return self

            def skip(self, *_args):
                return self

            def limit(self, *_args):
                return self

            def __iter__(self):
                return iter([event])

        class FakeCollection:
            def find(self, *_args):
                return FakeCursor()

        fake_mongo = {activity.AUDIT_COLLECTION: FakeCollection()}

        with patch.object(activity, "mongo_db", fake_mongo):
            result = routes_admin.list_audit_logs(
                limit=100,
                offset=0,
                event_type=None,
                search=None,
            )

        returned_event = result["events"][0]

        self.assertEqual(returned_event["event_type"], "file_download_success")
        self.assertEqual(returned_event["status"], "success")
        self.assertEqual(returned_event["details"], "Download completed")
        self.assertEqual(returned_event["log_id"], "audit-2")
        self.assertNotIn("_id", returned_event)
        self.assertNotIn("secret_token", returned_event)
        self.assertNotIn("wrapped_data_key", returned_event)

    def test_monitoring_audit_route_returns_same_authoritative_records(self):
        event = {
            "log_id": "audit-3",
            "activity_type": "file_upload_success",
            "activity_status": "success",
            "activity_description": "Uploaded file",
            "user_id": 5,
            "file_id": 13,
        }

        class Cursor:
            def sort(self, *_args): return self
            def skip(self, *_args): return self
            def limit(self, *_args): return self
            def __iter__(self): return iter([event])

        class Collection:
            def find(self, *_args): return Cursor()

        with patch.object(activity, "mongo_db", {activity.AUDIT_COLLECTION: Collection()}):
            legacy = routes_admin.list_audit_logs(limit=10, offset=0, event_type=None, user_id=5, status=None, start_date=None, end_date=None, search=None)
            current = routes_monitoring.audit_logs(user_id=5, file_id=13, activity_type="file_upload_success", status="success", start_date=None, end_date=None, search=None, limit=10, offset=0)

        self.assertEqual(legacy["events"], current["events"])
        self.assertEqual(current["logs"], current["events"])

    def test_monitoring_audit_route_rejects_regular_user(self):
        self.app.dependency_overrides[auth.get_current_user] = (
            lambda: SimpleNamespace(id=8, role="user")
        )
        with TestClient(self.app) as client:
            response = client.get("/audit-logs")
        self.assertEqual(response.status_code, 403)

if __name__ == "__main__":
    unittest.main()
