import json
import threading
from concurrent.futures import ThreadPoolExecutor
from types import SimpleNamespace
import unittest

from fastapi import HTTPException

import app.auth as auth
import app.routes_recovery as recovery
from app.schemas import RecoveryVerifyRequest


class AtomicFakeRedis:
    """Thread-safe fake for the recovery Lua operations; never connects to Redis."""

    def __init__(self):
        self.values = {}
        self.lock = threading.RLock()

    def setex(self, key, _ttl, value):
        with self.lock:
            self.values[key] = value

    def get(self, key):
        with self.lock:
            return self.values.get(key)

    def delete(self, key):
        with self.lock:
            return int(self.values.pop(key, None) is not None)

    def eval(self, script, _numkeys, key, *args):
        with self.lock:
            raw = self.values.get(key)
            if script == recovery._CONSUME_IF_UNCHANGED_SCRIPT:
                if raw == args[0]:
                    del self.values[key]
                    return 1
                return 0
            if script == recovery._RECORD_FAILED_ATTEMPT_SCRIPT:
                if raw is None:
                    return -1
                value = json.loads(raw)
                value["attempts"] = int(value.get("attempts", 0)) + 1
                if value["attempts"] >= int(args[0]):
                    del self.values[key]
                    return 0
                self.values[key] = json.dumps(value)
                return value["attempts"]
            if script == recovery._RECOVERY_EMAIL_LIMIT_SCRIPT:
                count = int(raw or 0) + 1
                self.values[key] = str(count)
                return count
            raise AssertionError("Unexpected recovery script")


class RecoverySecurityTests(unittest.TestCase):
    def setUp(self):
        self.old_redis = recovery.redis_client
        self.old_secret = recovery._secret
        self.old_limit = recovery._limit_recovery_subject
        recovery.redis_client = AtomicFakeRedis()
        recovery._secret = lambda: "test-secret-that-is-long-enough-123"
        recovery._limit_recovery_subject = lambda *_args: None
        self.user = SimpleNamespace(id=41, email="owner@example.test", role="user")

    def tearDown(self):
        recovery.redis_client = self.old_redis
        recovery._secret = self.old_secret
        recovery._limit_recovery_subject = self.old_limit

    def test_only_one_concurrent_correct_otp_verification_succeeds(self):
        challenge = recovery._new_challenge("folder", 9, self.user)
        request = RecoveryVerifyRequest(challenge_id=challenge["challenge_id"], code=challenge["code"])

        def verify():
            try:
                return recovery.verify_code(request, self.user)
            except HTTPException as exc:
                return exc.status_code

        with ThreadPoolExecutor(max_workers=8) as pool:
            results = list(pool.map(lambda _i: verify(), range(8)))
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual(sum(isinstance(result, int) and result == 400 for result in results), 7)

    def test_concurrent_wrong_codes_consume_attempt_budget_atomically(self):
        challenge = recovery._new_challenge("file", 3, self.user)
        request = RecoveryVerifyRequest(challenge_id=challenge["challenge_id"], code="999999")

        def verify():
            try:
                recovery.verify_code(request, self.user)
            except HTTPException as exc:
                return exc.status_code

        with ThreadPoolExecutor(max_workers=10) as pool:
            results = list(pool.map(lambda _i: verify(), range(10)))
        self.assertEqual(results.count(429), 1)
        self.assertEqual(results.count(400), 9)
        self.assertIsNone(recovery.redis_client.get(f"trustshare:recovery:challenge:{challenge['challenge_id']}"))

    def test_resource_recovery_rejects_unknown_kind(self):
        with self.assertRaises(HTTPException) as caught:
            recovery._resource("folder/../../users", 1, self.user, object())
        self.assertEqual(caught.exception.status_code, 404)

    def test_recovery_start_and_resend_subject_limit_is_fixed_window(self):
        recovery._limit_recovery_subject = self.old_limit
        for _ in range(recovery.MAX_RECOVERY_EMAILS_PER_WINDOW):
            recovery._limit_recovery_subject("account", "target@example.test")
        with self.assertRaises(HTTPException) as caught:
            recovery._limit_recovery_subject("account", "target@example.test")
        self.assertEqual(caught.exception.status_code, 429)
        self.assertEqual(caught.exception.headers["Retry-After"], str(recovery.RECOVERY_EMAIL_WINDOW_SECONDS))
        self.assertNotIn("target@example.test", " ".join(recovery.redis_client.values))

    def test_reset_authorization_is_consumed_once_under_concurrency(self):
        authorization = "synthetic-reset-token"
        key = f"trustshare:recovery:authorization:{authorization}"
        recovery.redis_client.setex(key, 600, json.dumps({
            "user_id": self.user.id, "kind": "folder", "resource_id": 9,
        }))
        resource = SimpleNamespace(password_hash="old-hash")
        original_resource = recovery._resource
        recovery._resource = lambda *_args: resource

        class DB:
            def __init__(self):
                self.commits = 0
                self.lock = threading.Lock()

            def commit(self):
                with self.lock:
                    self.commits += 1

        db = DB()
        def reset():
            try:
                return recovery.reset_password(
                    SimpleNamespace(reset_token=authorization, password="synthetic-password"),
                    self.user,
                    db,
                )
            except HTTPException as exc:
                return exc.status_code

        try:
            with ThreadPoolExecutor(max_workers=8) as pool:
                results = list(pool.map(lambda _i: reset(), range(8)))
        finally:
            recovery._resource = original_resource
        self.assertEqual(sum(isinstance(result, dict) for result in results), 1)
        self.assertEqual(db.commits, 1)

    def test_reset_authorization_is_bound_to_its_user(self):
        reset_token = "owner-bound-token"
        key = f"trustshare:recovery:authorization:{reset_token}"
        recovery.redis_client.setex(key, 600, json.dumps({
            "user_id": self.user.id + 1, "kind": "file", "resource_id": 9,
        }))
        with self.assertRaises(HTTPException) as caught:
            recovery.reset_password(
                SimpleNamespace(reset_token=reset_token, password="synthetic-password"),
                self.user,
                object(),
            )
        self.assertEqual(caught.exception.status_code, 403)
        self.assertIsNotNone(recovery.redis_client.get(key))

    def test_account_recovery_invalidates_preexisting_access_token(self):
        user = SimpleNamespace(
            id=52, email="person@example.test", role="user",
            hashed_password=auth.hash_password("old-password"),
        )
        token = auth.create_access_token(user)
        reset_token = "account-reset-token"
        key = f"trustshare:recovery:authorization:{reset_token}"
        recovery.redis_client.setex(key, 600, json.dumps({"user_id": user.id, "kind": "account"}))

        class Query:
            def filter(self, condition):
                self.user_id = condition.right.value
                return self

            def first(self):
                return user if user.id == self.user_id else None

        class DB:
            def query(self, _model):
                return Query()

            def commit(self):
                pass

        recovery.reset_account_password(
            SimpleNamespace(reset_token=reset_token, password="new-password"), DB()
        )
        with self.assertRaises(HTTPException) as caught:
            auth.get_current_user(SimpleNamespace(credentials=token), DB())
        self.assertEqual(caught.exception.status_code, 401)


if __name__ == "__main__":
    unittest.main()
