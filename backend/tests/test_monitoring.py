import unittest
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from threading import Lock
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import HTTPException
from fastapi import FastAPI
from fastapi.testclient import TestClient
from pymongo.errors import DuplicateKeyError

import app.activity as activity
import app.auth as auth
from app.routes_files import record_share_access_denial
from app.routes_monitoring import _date_filter
import app.routes_monitoring as monitoring
from app.models import FileShare, FolderShare, User


class FakeNotificationCollection:
    def __init__(self):
        self.documents = []
        self.lock = Lock()

    def find_one(self, query):
        return next((row for row in self.documents if all(row.get(key) == value for key, value in query.items())), None)

    def insert_one(self, document):
        self.documents.append(document)

    def update_one(self, query, update, upsert=False):
        with self.lock:
            row = next((item for item in self.documents if item.get("_id") == query.get("_id")), None)
            if row is not None:
                return SimpleNamespace(upserted_id=None, matched_count=1)
            if upsert:
                self.documents.append(dict(update["$setOnInsert"]))
                return SimpleNamespace(upserted_id=query.get("_id"), matched_count=0)
            return SimpleNamespace(upserted_id=None, matched_count=0)

    def count_documents(self, query):
        return sum(all(row.get(key) == value for key, value in query.items()) for row in self.documents)

    def find(self, query, projection=None):
        rows = [
            {key: value for key, value in row.items() if key != "_id"}
            for row in self.documents
            if all(row.get(key) == value for key, value in query.items())
        ]
        return FakeNotificationCursor(rows)


class FakeNotificationCursor:
    def __init__(self, rows):
        self.rows = rows

    def sort(self, key, direction):
        self.rows.sort(key=lambda row: row.get(key), reverse=direction < 0)
        return self

    def skip(self, offset):
        self.rows = self.rows[offset:]
        return self

    def limit(self, limit):
        self.rows = self.rows[:limit]
        return self

    def __iter__(self):
        return iter(self.rows)


class FakeWriteCollection:
    def __init__(self, fail=False):
        self.documents = []
        self.fail = fail

    def insert_one(self, document):
        if self.fail:
            raise RuntimeError("simulated MongoDB failure")
        self.documents.append(document)


class FakeWriteDatabase(dict):
    def __getitem__(self, name):
        return super().__getitem__(name)


class FakeCountCollection:
    def __init__(self, count):
        self.count = count
        self.query = None

    def count_documents(self, query):
        self.query = query
        return self.count


class FakeAtomicSecurityCollection:
    def __init__(self):
        self.documents = {}
        self.lock = Lock()

    def find_one(self, _query):
        # Force concurrent callers through to the atomic upsert.
        return None

    def update_one(self, query, update, upsert=False):
        self.assert_upsert = upsert
        with self.lock:
            key = query["_id"]
            if key in self.documents:
                raise DuplicateKeyError("simulated concurrent _id upsert")
            document = update["$setOnInsert"]
            self.documents[key] = document
            return SimpleNamespace(upserted_id=key)


class MonitoringUnitTests(unittest.TestCase):
    def test_admin_notifications_are_filtered_and_role_protected(self):
        collection = FakeNotificationCollection()
        collection.documents.extend([
            {"notification_id": "one", "user_id": 7, "read": False, "created_at": datetime(2026, 1, 2)},
            {"notification_id": "two", "user_id": 8, "read": True, "created_at": datetime(2026, 1, 3)},
        ])
        app = FastAPI()
        app.include_router(monitoring.router)
        app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(id=7, role="admin")
        with patch.object(monitoring, "mongo_db", {monitoring.NOTIFICATION_COLLECTION: collection}):
            with TestClient(app) as client:
                allowed = client.get("/admin/notifications", params={"user_id": 7})
                app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(id=7, role="user")
                denied = client.get("/admin/notifications")
        self.assertEqual(allowed.status_code, 200)
        self.assertEqual(allowed.json()["total"], 1)
        self.assertEqual(allowed.json()["unread_count"], 1)
        self.assertEqual([row["notification_id"] for row in allowed.json()["notifications"]], ["one"])
        self.assertEqual(denied.status_code, 403)

    def test_date_filter_rejects_invalid_and_reversed_ranges(self):
        with self.assertRaises(HTTPException) as invalid:
            _date_filter("not-a-date", None)
        self.assertEqual(invalid.exception.status_code, 422)

        with self.assertRaises(HTTPException) as reversed_range:
            _date_filter("2026-11-03", "2026-11-02")
        self.assertEqual(reversed_range.exception.status_code, 422)

    def test_notification_has_random_id_and_is_unread(self):
        collection = FakeNotificationCollection()
        with patch.object(activity, "mongo_db", {activity.NOTIFICATION_COLLECTION: collection}):
            activity.create_notification(7, "Shared file", "A file was shared.", "file_shared")

        self.assertEqual(len(collection.documents), 1)
        notification = collection.documents[0]
        self.assertTrue(notification["notification_id"])
        self.assertFalse(notification["read"])
        self.assertEqual(notification["user_id"], 7)

    def test_deduplicated_notification_uses_atomic_upsert(self):
        collection = FakeNotificationCollection()
        with patch.object(activity, "mongo_db", {activity.NOTIFICATION_COLLECTION: collection}):
            self.assertTrue(activity.create_notification(7, "Security alert", "Alert", "security_alert", dedupe_key="event-1"))
            self.assertFalse(activity.create_notification(7, "Security alert", "Alert", "security_alert", dedupe_key="event-1"))
        self.assertEqual(len(collection.documents), 1)

    def test_share_denial_classifies_expired_and_revoked_links(self):
        user = SimpleNamespace(id=9)
        expired = SimpleNamespace(
            id=101,
            owner_id=42,
            permission="download",
            revoked=False,
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )
        revoked = SimpleNamespace(
            id=102,
            owner_id=42,
            permission="download",
            revoked=True,
            expires_at=None,
        )

        with patch("app.routes_files.record_activity") as recorder, patch("app.routes_files.create_notification") as notify:
            record_share_access_denial(expired, user, "expired-token", permission="download")
            record_share_access_denial(revoked, user, "revoked-token", permission="download")

        self.assertEqual(recorder.call_args_list[0].args[0], "expired_link_access")
        self.assertEqual(recorder.call_args_list[1].args[0], "revoked_link_access")
        self.assertEqual(notify.call_count, 2)
        self.assertNotIn("expired-token", str(notify.call_args_list))
        self.assertNotIn("revoked-token", str(notify.call_args_list))

    def test_expiry_reminders_cover_file_and_folder_shares(self):
        now = datetime(2026, 11, 10, 12, 0, tzinfo=timezone.utc)
        file_share = SimpleNamespace(
            id=4,
            recipient_email="recipient@example.test",
            expires_at=now + timedelta(hours=4),
            revoked=False,
        )
        folder_share = SimpleNamespace(
            id=8,
            recipient_email="recipient@example.test",
            expires_at=now + timedelta(hours=8),
            revoked=False,
        )
        recipient = SimpleNamespace(id=12, email="recipient@example.test")

        class Query:
            def __init__(self, rows):
                self.rows = rows

            def filter(self, *_filters):
                return self

            def all(self):
                return self.rows

            def first(self):
                return self.rows[0] if self.rows else None

        class FakeDb:
            def query(self, model):
                if model is FileShare:
                    return Query([file_share])
                if model is FolderShare:
                    return Query([folder_share])
                if model is User:
                    return Query([recipient])
                raise AssertionError(f"Unexpected model: {model}")

        with patch("app.activity.create_notification", return_value=True) as notifier:
            created = activity.create_expiry_reminders(FakeDb(), now=now)

        self.assertEqual(created, 2)
        self.assertEqual(
            [call.args[3] for call in notifier.call_args_list],
            ["share_expiry_reminder", "share_expiry_reminder"],
        )
        self.assertIn("file_share_expiry:4:", notifier.call_args_list[0].kwargs["dedupe_key"])
        self.assertIn("folder_share_expiry:8:", notifier.call_args_list[1].kwargs["dedupe_key"])

    def test_notification_read_and_list_are_scoped_to_user(self):
        class Cursor(list):
            def sort(self, *_args):
                return self
            def skip(self, _amount):
                return self
            def limit(self, _amount):
                return self
        class Collection:
            def __init__(self):
                self.documents = [
                    {"notification_id": "mine", "user_id": 7, "read": False, "created_at": datetime.now(timezone.utc)},
                    {"notification_id": "theirs", "user_id": 8, "read": False, "created_at": datetime.now(timezone.utc)},
                ]
                self.queries = []
            def find(self, query, _projection):
                self.queries.append(query)
                return Cursor([row for row in self.documents if all(row.get(k) == v for k, v in query.items())])
            def count_documents(self, query):
                return sum(all(row.get(k) == v for k, v in query.items()) for row in self.documents)
            def update_one(self, query, update):
                self.queries.append(query)
                row = next((row for row in self.documents if all(row.get(k) == v for k, v in query.items())), None)
                if row:
                    row.update(update["$set"])
                return SimpleNamespace(matched_count=int(row is not None))
            def update_many(self, query, update):
                self.queries.append(query)
                rows = [row for row in self.documents if all(row.get(k) == v for k, v in query.items())]
                for row in rows:
                    row.update(update["$set"])
                return SimpleNamespace(modified_count=len(rows))
        collection = Collection()
        with patch.object(monitoring, "mongo_db", {monitoring.NOTIFICATION_COLLECTION: collection}):
            result = monitoring.list_notifications(SimpleNamespace(id=7), limit=10, offset=0)
            self.assertEqual([item["notification_id"] for item in result["notifications"]], ["mine"])
            with self.assertRaises(HTTPException) as cross_user:
                monitoring.mark_notification_read("theirs", SimpleNamespace(id=7))
            self.assertEqual(cross_user.exception.status_code, 404)
            updated = monitoring.mark_all_notifications_read(SimpleNamespace(id=7))
        self.assertEqual(updated["updated"], 1)
        self.assertTrue(all(query.get("user_id") == 7 for query in collection.queries))

    def test_audit_history_is_written_for_required_event_types_with_statuses(self):
        activity_collection = FakeWriteCollection()
        audit_collection = FakeWriteCollection()
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.AUDIT_COLLECTION: audit_collection,
        })
        cases = [
            ("login_success", "success"),
            ("login_failed", "failed"),
            ("logout", "success"),
            ("file_upload_success", "success"),
            ("file_download_success", "success"),
            ("file_preview_success", "success"),
            ("file_delete_success", "success"),
            ("file_share_created", "success"),
            ("folder_access_granted", "success"),
            ("folder_access_changed", "success"),
            ("folder_access_revoked", "success"),
            ("unauthorized_access", "failed"),
            ("expired_link_access", "failed"),
            ("revoked_link_access", "failed"),
        ]
        with (
            patch.object(activity, "mongo_db", database),
            patch.object(activity, "_evaluate_security_rules"),
        ):
            for event_type, _expected_status in cases:
                activity.record_activity(event_type, 7, file_id=12, folder_id=4)

        self.assertEqual(len(activity_collection.documents), len(cases))
        self.assertEqual(len(audit_collection.documents), len(cases))
        self.assertEqual(
            [(row["activity_type"], row["activity_status"]) for row in audit_collection.documents],
            cases,
        )
        self.assertEqual(audit_collection.documents[-1]["folder_id"], 4)

    def test_audit_write_is_attempted_if_activity_write_fails(self):
        activity_collection = FakeWriteCollection(fail=True)
        audit_collection = FakeWriteCollection()
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.AUDIT_COLLECTION: audit_collection,
        })
        with (
            patch.object(activity, "mongo_db", database),
            patch.object(activity, "_evaluate_security_rules") as rules,
            self.assertLogs(activity.activity_logger, level="WARNING"),
        ):
            activity.record_activity("login_failed", 7)

        self.assertEqual(len(audit_collection.documents), 1)
        self.assertEqual(audit_collection.documents[0]["activity_status"], "failed")
        rules.assert_not_called()

    def test_audit_write_failure_is_logged_without_failing_primary_action(self):
        activity_collection = FakeWriteCollection()
        audit_collection = FakeWriteCollection(fail=True)
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.AUDIT_COLLECTION: audit_collection,
        })
        with (
            patch.object(activity, "mongo_db", database),
            patch.object(activity, "_evaluate_security_rules"),
            self.assertLogs(activity.activity_logger, level="WARNING") as captured,
        ):
            activity.record_activity("file_upload_success", 7, file_id=12)

        self.assertEqual(len(activity_collection.documents), 1)
        self.assertTrue(any("Audit history write failed" in line for line in captured.output))

    def test_security_rule_threshold_boundaries_and_admin_notifications(self):
        cases = [
            ("login_failed", 5, 600, "FAILED_LOGIN_THRESHOLD"),
            ("file_download_success", 20, 300, "DOWNLOAD_THRESHOLD"),
            ("unauthorized_access", 3, 600, "UNAUTHORIZED_THRESHOLD"),
            ("expired_link_access", 3, 600, "EXPIRED_LINK_THRESHOLD"),
            ("revoked_link_access", 3, 600, "REVOKED_LINK_THRESHOLD"),
        ]
        for event_type, threshold, window, env_name in cases:
            for count, should_alert in ((threshold, False), (threshold + 1, True)):
                with self.subTest(event_type=event_type, count=count):
                    activity_collection = FakeCountCollection(count)
                    security_collection = FakeAtomicSecurityCollection()
                    notifications = FakeNotificationCollection()
                    database = FakeWriteDatabase({
                        activity.ACTIVITY_COLLECTION: activity_collection,
                        activity.SECURITY_COLLECTION: security_collection,
                        activity.NOTIFICATION_COLLECTION: notifications,
                    })
                    with (
                        patch.object(activity, "mongo_db", database),
                        patch.dict("os.environ", {env_name: str(threshold), "SECURITY_ALERT_ADMIN_IDS": "42,invalid"}),
                    ):
                        activity._evaluate_security_rules({"event_type": event_type, "user_id": 7})

                    self.assertEqual(len(security_collection.documents), int(should_alert))
                    self.assertEqual(len(notifications.documents), int(should_alert))
                    if should_alert:
                        alert = next(iter(security_collection.documents.values()))
                        self.assertEqual(alert["window"], window)
                        self.assertEqual(alert["user_id"], 7)
                        self.assertEqual(notifications.documents[0]["user_id"], 42)
                    if activity_collection.query:
                        self.assertIn("$gte", activity_collection.query["created_at"])
                        self.assertIn("$lte", activity_collection.query["created_at"])

    def test_custom_download_threshold_boundary(self):
        activity_collection = FakeCountCollection(2)
        security_collection = FakeAtomicSecurityCollection()
        notifications = FakeNotificationCollection()
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.SECURITY_COLLECTION: security_collection,
            activity.NOTIFICATION_COLLECTION: notifications,
        })
        with (
            patch.object(activity, "mongo_db", database),
            patch.dict("os.environ", {"DOWNLOAD_THRESHOLD": "2", "SECURITY_ALERT_ADMIN_IDS": "42"}),
        ):
            activity._evaluate_security_rules({"event_type": "file_download_success", "user_id": 7})
            self.assertEqual(len(security_collection.documents), 0)
            activity_collection.count = 3
            activity._evaluate_security_rules({"event_type": "file_download_success", "user_id": 7})

        self.assertEqual(len(security_collection.documents), 1)

    def test_concurrent_security_evaluations_create_one_event_and_notification(self):
        activity_collection = FakeCountCollection(6)
        security_collection = FakeAtomicSecurityCollection()
        notifications = FakeNotificationCollection()
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.SECURITY_COLLECTION: security_collection,
            activity.NOTIFICATION_COLLECTION: notifications,
        })
        document = {"event_type": "login_failed", "user_id": 7}
        with (
            patch.object(activity, "mongo_db", database),
            patch.dict("os.environ", {"FAILED_LOGIN_THRESHOLD": "5", "SECURITY_ALERT_ADMIN_IDS": "42"}),
        ):
            with ThreadPoolExecutor(max_workers=12) as workers:
                list(workers.map(lambda _index: activity._evaluate_security_rules(document), range(36)))

        self.assertEqual(len(security_collection.documents), 1)
        self.assertTrue(security_collection.assert_upsert)
        self.assertEqual(len(notifications.documents), 1)

    def test_distinct_users_get_distinct_admin_security_notifications(self):
        activity_collection = FakeCountCollection(6)
        security_collection = FakeAtomicSecurityCollection()
        notifications = FakeNotificationCollection()
        database = FakeWriteDatabase({
            activity.ACTIVITY_COLLECTION: activity_collection,
            activity.SECURITY_COLLECTION: security_collection,
            activity.NOTIFICATION_COLLECTION: notifications,
        })
        with (
            patch.object(activity, "mongo_db", database),
            patch.dict("os.environ", {"FAILED_LOGIN_THRESHOLD": "5", "SECURITY_ALERT_ADMIN_IDS": "42"}),
        ):
            activity._evaluate_security_rules({"event_type": "login_failed", "user_id": 7})
            activity._evaluate_security_rules({"event_type": "login_failed", "user_id": 8})

        self.assertEqual(len(security_collection.documents), 2)
        self.assertEqual(len(notifications.documents), 2)
        self.assertEqual({row["dedupe_key"] for row in notifications.documents}, set(security_collection.documents))

    def test_denied_link_event_does_not_record_the_capability_token(self):
        user = SimpleNamespace(id=9)
        revoked = SimpleNamespace(id=103, owner_id=42, permission="download", revoked=True, expires_at=None)
        token = "do-not-persist-this-token"
        with patch("app.routes_files.record_activity") as recorder:
            record_share_access_denial(revoked, user, token, permission="download")

        self.assertEqual(recorder.call_args.kwargs["target_name"], "shared link")
        self.assertNotIn(token, str(recorder.call_args))

    def test_rbac_denial_does_not_record_sensitive_route_path(self):
        dependency = auth.require_roles("admin")
        request = SimpleNamespace(
            method="GET",
            url=SimpleNamespace(path="/files/shared/private-capability-token"),
            client=SimpleNamespace(host="198.51.100.8"),
        )
        user = SimpleNamespace(id=9, role="user")
        with patch.object(auth, "record_activity") as recorder:
            with self.assertRaises(HTTPException):
                dependency(request, user)

        self.assertEqual(recorder.call_args.kwargs["details"], "Protected route access denied")
        self.assertNotIn("private-capability-token", str(recorder.call_args))


if __name__ == "__main__":
    unittest.main()
