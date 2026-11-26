import unittest
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException

import app.activity as activity
import app.database as database
import app.rate_limit as rate_limit


class FakeActivityCollection:
    def __init__(self, fail=False):
        self.documents = []
        self.indexes = []
        self.fail = fail

    def insert_one(self, document):
        if self.fail:
            raise RuntimeError("simulated MongoDB failure")
        self.documents.append(document)

    def create_index(self, fields, name):
        if self.fail:
            raise RuntimeError("simulated MongoDB failure")
        self.indexes.append((fields, name))


class FakeMongo:
    def __init__(self, collection):
        self.collection = collection

    def __getitem__(self, _name):
        return self.collection


class FakeRedis:
    def __init__(self, fail=False):
        self.counts = {}
        self.expirations = []
        self.fail = fail

    def incr(self, key):
        if self.fail:
            raise RuntimeError("simulated Redis failure")
        self.counts[key] = self.counts.get(key, 0) + 1
        return self.counts[key]

    def expire(self, key, seconds):
        if self.fail:
            raise RuntimeError("simulated Redis failure")
        self.expirations.append((key, seconds))
        return True


class ActivityLoggingTests(unittest.TestCase):
    def setUp(self):
        self.collection = FakeActivityCollection()
        self.original_mongo = activity.mongo_db
        activity.mongo_db = FakeMongo(self.collection)

    def tearDown(self):
        activity.mongo_db = self.original_mongo

    def test_activity_event_is_written_to_separate_audit_collection(self):
        class SeparateFakeMongo:
            def __init__(self):
                self.collections = {
                    activity.ACTIVITY_COLLECTION: FakeActivityCollection(),
                    activity.AUDIT_COLLECTION: FakeActivityCollection(),
                }

            def __getitem__(self, name):
                return self.collections[name]

        fake_mongo = SeparateFakeMongo()
        original_mongo = activity.mongo_db
        original_evaluator = activity._evaluate_security_rules

        activity.mongo_db = fake_mongo
        activity._evaluate_security_rules = lambda _document: None

        try:
            activity.record_activity(
                "file_download_success",
                user_id=42,
                username="test_user",
                file_id=123,
                resource_owner_id=7,
                shared_download=True,
            )
        finally:
            activity.mongo_db = original_mongo
            activity._evaluate_security_rules = original_evaluator

        activity_documents = fake_mongo.collections[
            activity.ACTIVITY_COLLECTION
        ].documents
        audit_documents = fake_mongo.collections[
            activity.AUDIT_COLLECTION
        ].documents

        self.assertEqual(len(activity_documents), 1)
        self.assertEqual(len(audit_documents), 1)

        activity_document = activity_documents[0]
        audit_document = audit_documents[0]

        self.assertEqual(activity_document["event_type"], "file_download_success")
        self.assertEqual(activity_document["user_id"], 42)
        self.assertEqual(activity_document["file_id"], 123)
        self.assertEqual(activity_document["resource_owner_id"], 7)
        self.assertTrue(activity_document["shared_download"])

        self.assertEqual(audit_document["activity_id"], activity_document["activity_id"])
        self.assertEqual(audit_document["activity_type"], "file_download_success")
        self.assertEqual(audit_document["activity_status"], "success")
        self.assertEqual(audit_document["user_id"], 42)
        self.assertEqual(audit_document["username"], "test_user")
        self.assertEqual(audit_document["file_id"], 123)
        self.assertEqual(audit_document["resource_owner_id"], 7)
    def test_audit_username_is_not_inferred_from_target_name(self):
        class SeparateFakeMongo:
            def __init__(self):
                self.collections = {
                    activity.ACTIVITY_COLLECTION: FakeActivityCollection(),
                    activity.AUDIT_COLLECTION: FakeActivityCollection(),
                }

            def __getitem__(self, name):
                return self.collections[name]

        fake_mongo = SeparateFakeMongo()
        original_mongo = activity.mongo_db
        original_evaluator = activity._evaluate_security_rules

        activity.mongo_db = fake_mongo
        activity._evaluate_security_rules = lambda _document: None

        try:
            activity.record_activity(
                "file_share_created",
                user_id=42,
                target_name="shared link",
            )
            activity.record_activity(
                "file_share_created",
                user_id=43,
                username="alice",
                target_name="report.pdf",
            )
        finally:
            activity.mongo_db = original_mongo
            activity._evaluate_security_rules = original_evaluator

        audit_documents = fake_mongo.collections[
            activity.AUDIT_COLLECTION
        ].documents

        self.assertEqual(len(audit_documents), 2)

        self.assertIsNone(audit_documents[0]["username"])
        self.assertEqual(audit_documents[0]["target_name"], "shared link")

        self.assertEqual(audit_documents[1]["username"], "alice")
        self.assertEqual(audit_documents[1]["target_name"], "report.pdf")
    def test_activity_event_contains_only_safe_metadata(self):
        activity.record_activity(
            "file_upload_success",
            101,
            file_id=7,
        )

        self.assertEqual(len(self.collection.documents), 1)
        document = self.collection.documents[0]
        self.assertEqual(document["event_type"], "file_upload_success")
        self.assertEqual(document["user_id"], 101)
        self.assertEqual(document["file_id"], 7)
        self.assertIn("created_at", document)
        self.assertNotIn("password", document)
        self.assertNotIn("access_token", document)
        self.assertNotIn("authorization_code", document)
        self.assertNotIn("file_contents", document)

    def test_mongo_failure_does_not_fail_primary_operation(self):
        activity.mongo_db = FakeMongo(FakeActivityCollection(fail=True))
        activity.record_activity("login_success", 101, provider="local")

    def test_activity_indexes_are_requested(self):
        activity.ensure_activity_indexes()
        self.assertEqual(len(self.collection.indexes), 2)


class RateLimitTests(unittest.TestCase):
    def setUp(self):
        self.redis = FakeRedis()
        self.original_redis = rate_limit.redis_client
        self.original_max = rate_limit.AUTH_RATE_LIMIT_MAX_ATTEMPTS
        self.original_window = rate_limit.AUTH_RATE_LIMIT_WINDOW_SECONDS
        self.original_settings_reader = rate_limit.get_persisted_setting
        rate_limit.redis_client = self.redis
        rate_limit.AUTH_RATE_LIMIT_MAX_ATTEMPTS = 2
        rate_limit.AUTH_RATE_LIMIT_WINDOW_SECONDS = 60
        rate_limit.get_persisted_setting = lambda _key, fallback: fallback
        self.request = SimpleNamespace(
            client=SimpleNamespace(host="198.51.100.10")
        )

    def tearDown(self):
        rate_limit.redis_client = self.original_redis
        rate_limit.AUTH_RATE_LIMIT_MAX_ATTEMPTS = self.original_max
        rate_limit.AUTH_RATE_LIMIT_WINDOW_SECONDS = self.original_window
        rate_limit.get_persisted_setting = self.original_settings_reader

    def test_rate_limit_uses_namespaced_expiring_key(self):
        rate_limit.enforce_auth_rate_limit("login", self.request)
        rate_limit.enforce_auth_rate_limit("login", self.request)

        self.assertEqual(
            list(self.redis.counts),
            ["trustshare:rate:login:198.51.100.10"],
        )
        self.assertEqual(
            self.redis.expirations,
            [("trustshare:rate:login:198.51.100.10", 60)],
        )

    def test_rate_limit_rejects_after_configured_attempts(self):
        rate_limit.enforce_auth_rate_limit("register", self.request)
        rate_limit.enforce_auth_rate_limit("register", self.request)

        with self.assertRaises(HTTPException) as context:
            rate_limit.enforce_auth_rate_limit("register", self.request)

        self.assertEqual(context.exception.status_code, 429)

    def test_redis_failure_temporarily_blocks_authentication(self):
        rate_limit.redis_client = FakeRedis(fail=True)
        with self.assertLogs(rate_limit.rate_logger, level="WARNING") as captured:
            with self.assertRaises(HTTPException) as raised:
                rate_limit.enforce_auth_rate_limit("login", self.request)
        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(
            raised.exception.headers["Retry-After"],
            str(rate_limit.AUTH_RATE_LIMIT_WINDOW_SECONDS),
        )
        self.assertTrue(any("Redis rate limit unavailable" in line for line in captured.output))


if __name__ == "__main__":
    unittest.main()
