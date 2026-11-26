import asyncio
import unittest
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

from fastapi import Request
from fastapi.exceptions import HTTPException

import app.routes_auth as routes_auth
import app.routes_folders as routes_folders
import app.routes_recovery as routes_recovery
from app.models import User
from app.schemas import (
    AccountRecoveryStartRequest,
    LoginRequest,
    RegisterRequest,
)


class FakeQuery:
    def __init__(self, users):
        self.users = users
        self.email = None

    def filter(self, *conditions):
        for condition in conditions:
            if getattr(condition.left, "key", None) == "email":
                self.email = condition.right.value
        return self

    def first(self):
        return next(
            (user for user in self.users if user.email == self.email),
            None,
        )


class FakeSession:
    def __init__(self):
        self.users = []
        self.next_id = 1

    def query(self, model):
        if model is not User:
            raise AssertionError("Unexpected model queried")
        return FakeQuery(self.users)

    def add(self, user):
        user.id = self.next_id
        self.next_id += 1
        self.users.append(user)

    def commit(self):
        return None

    def refresh(self, user):
        return None


def request():
    return Request(
        {
            "type": "http",
            "method": "POST",
            "path": "/auth/login",
            "headers": [],
            "query_string": b"",
            "server": ("testserver", 80),
            "client": ("testclient", 50000),
            "scheme": "http",
        }
    )


class AuthenticationRouteTests(unittest.TestCase):
    def setUp(self):
        self.db = FakeSession()
        self.original_rate_limit = routes_auth.enforce_auth_rate_limit
        self.original_activity = routes_auth.record_activity
        routes_auth.enforce_auth_rate_limit = lambda scope, request: None
        routes_auth.record_activity = lambda *args, **kwargs: None

    def test_gmail_connect_uses_separate_send_scope_and_configured_callback(self):
        scope = {
            "type": "http", "method": "POST", "path": "/auth/google/gmail/connect/start",
            "headers": [], "query_string": b"", "server": ("testserver", 80),
            "client": ("testclient", 50000), "scheme": "http", "session": {},
        }
        req = Request(scope)
        authorization = {"url": "https://accounts.google.com/o/oauth2/auth?state=opaque", "state": "opaque"}
        client = SimpleNamespace(
            create_authorization_url=AsyncMock(return_value=authorization),
            save_authorize_data=AsyncMock(),
        )
        user = SimpleNamespace(id=4)
        with patch.object(routes_auth, "get_provider_client", return_value=client):
            result = asyncio.run(routes_auth.google_gmail_connect_start(req, user))

        self.assertEqual(result["authorization_url"], authorization["url"])
        self.assertEqual(req.session["gmail_connect_user_id"], user.id)
        call_args = client.create_authorization_url.await_args
        self.assertEqual(call_args.args[0], routes_auth.GOOGLE_GMAIL_REDIRECT_URI)
        self.assertIn("https://www.googleapis.com/auth/gmail.send", call_args.kwargs["scope"])
        self.assertNotEqual(routes_auth.GOOGLE_GMAIL_REDIRECT_URI, routes_auth.GOOGLE_REDIRECT_URI)

    def test_gmail_callback_binds_verified_sender_to_initiating_trustshare_user(self):
        scope = {
            "type": "http", "method": "GET", "path": "/auth/google/gmail/callback",
            "headers": [], "query_string": b"code=opaque&state=opaque", "server": ("testserver", 80),
            "client": ("testclient", 50000), "scheme": "http",
            "session": {"gmail_connect_user_id": 4},
        }
        req = Request(scope)
        token = {
            "userinfo": {"email": "sender@example.com", "email_verified": True},
            "scope": "openid email profile https://www.googleapis.com/auth/gmail.send",
            "access_token": "opaque-test-access", "refresh_token": "opaque-test-refresh",
        }
        client = SimpleNamespace(authorize_access_token=AsyncMock(return_value=token))
        with patch.object(routes_auth, "get_provider_client", return_value=client), patch.object(
            routes_auth, "save_gmail_credential"
        ) as save_credential:
            response = asyncio.run(routes_auth.google_gmail_callback(req, self.db))

        self.assertTrue(response.headers["location"].endswith("/dashboard?gmail=connected"))
        save_credential.assert_called_once_with(self.db, 4, "sender@example.com", token)
        self.assertNotIn("gmail_connect_user_id", req.session)

    def tearDown(self):
        routes_auth.enforce_auth_rate_limit = self.original_rate_limit
        routes_auth.record_activity = self.original_activity

    def test_register_then_login_normalizes_email_and_returns_token(self):
        registered = routes_auth.register(
            RegisterRequest(
                full_name="Test User",
                email="  TestUser@Example.com ",
                password="correct-password",
            ),
            request(),
            self.db,
        )

        self.assertEqual(registered["user"]["email"], "testuser@example.com")
        self.assertNotEqual(
            self.db.users[0].hashed_password,
            "correct-password",
        )

        logged_in = routes_auth.login(
            LoginRequest(
                email=" TESTUSER@example.com ",
                password="correct-password",
            ),
            request(),
            self.db,
        )

        self.assertEqual(logged_in["token_type"], "bearer")
        self.assertEqual(logged_in["user"]["email"], "testuser@example.com")

    def test_invalid_password_and_unknown_email_are_rejected(self):
        routes_auth.register(
            RegisterRequest(
                full_name="Test User",
                email="user@example.com",
                password="correct-password",
            ),
            request(),
            self.db,
        )

        for email, password in (
            ("user@example.com", "wrong-password"),
            ("unknown@example.com", "correct-password"),
        ):
            with self.subTest(email=email):
                with self.assertRaises(HTTPException) as context:
                    routes_auth.login(
                        LoginRequest(email=email, password=password),
                        request(),
                        self.db,
                    )
                self.assertEqual(context.exception.status_code, 401)

    def test_oauth_only_account_cannot_use_password_login(self):
        self.db.add(
            User(
                full_name="OAuth User",
                email="oauth@example.com",
                hashed_password=None,
                auth_provider="google",
                role="user",
            )
        )

        with self.assertRaises(HTTPException) as context:
            routes_auth.login(
                LoginRequest(
                    email="oauth@example.com",
                    password="some-password",
                ),
                request(),
                self.db,
            )

        self.assertEqual(context.exception.status_code, 401)

    def test_recovery_requires_verified_single_use_authorization(self):
        folder = SimpleNamespace(
            id=7,
            owner_id=1,
            password_hash=routes_folders.hash_folder_password(
                "old-password"
            ),
        )
        original_hash = folder.password_hash
        original_resource = routes_recovery._resource
        original_send = routes_recovery._send_otp
        original_redis = routes_recovery.redis_client
        original_limit = routes_recovery._limit_recovery_subject
        sent = {}

        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

            def delete(self, key):
                self.values.pop(key, None)

            def eval(self, script, _numkeys, key, *args):
                if script == routes_recovery._CONSUME_IF_UNCHANGED_SCRIPT:
                    if self.values.get(key) == args[0]:
                        del self.values[key]
                        return 1
                    return 0
                if script == routes_recovery._RECORD_FAILED_ATTEMPT_SCRIPT:
                    value = __import__("json").loads(self.values[key])
                    value["attempts"] += 1
                    if value["attempts"] >= int(args[0]):
                        self.values.pop(key, None)
                        return 0
                    self.values[key] = __import__("json").dumps(value)
                    return value["attempts"]
                raise AssertionError("Unexpected recovery script")

        routes_recovery.redis_client = FakeRedis()
        routes_recovery._limit_recovery_subject = lambda *_args: None
        routes_recovery._resource = (
            lambda kind, resource_id, user, db: folder
        )
        routes_recovery._send_otp = (
            lambda email, code: sent.update(code=code)
        )
        user = SimpleNamespace(
            id=1,
            email="user@example.com",
            role="user",
        )

        try:
            started = routes_recovery.start_recovery(
                "folder", 7, user, self.db
            )
            with self.assertRaises(HTTPException):
                routes_recovery.reset_password(
                    SimpleNamespace(
                        reset_token="not-verified",
                        password="new-password",
                    ),
                    user,
                    self.db,
                )
            verified = routes_recovery.verify_code(
                SimpleNamespace(
                    challenge_id=started["challenge_id"],
                    code=sent["code"],
                ),
                user,
            )
            routes_recovery.reset_password(
                SimpleNamespace(
                    reset_token=verified["reset_token"],
                    password="new-password",
                ),
                user,
                self.db,
            )
            with self.assertRaises(HTTPException):
                routes_recovery.reset_password(
                    SimpleNamespace(
                        reset_token=verified["reset_token"],
                        password="another-password",
                    ),
                    user,
                    self.db,
                )
        finally:
            routes_recovery._resource = original_resource
            routes_recovery._send_otp = original_send
            routes_recovery.redis_client = original_redis
            routes_recovery._limit_recovery_subject = original_limit

        self.assertNotEqual(folder.password_hash, original_hash)
        self.assertTrue(
            routes_folders.verify_folder_password(
                "new-password", folder.password_hash
            )
        )

    def test_account_recovery_response_does_not_disclose_unknown_accounts(self):
        original_redis = routes_recovery.redis_client
        original_secret = routes_recovery._secret
        original_send = routes_recovery._send_otp
        original_limit = routes_recovery._limit_recovery_subject

        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

        sent = []
        routes_recovery.redis_client = FakeRedis()
        routes_recovery._secret = lambda: "x" * 32
        routes_recovery._limit_recovery_subject = lambda *_args: None
        routes_recovery._send_otp = lambda email, code: sent.append(email)
        self.db.users = [
            User(
                full_name="OAuth User",
                email="oauth@example.com",
                hashed_password=None,
                auth_provider="google",
                role="user",
            )
        ]

        try:
            unknown = routes_recovery.start_account_recovery(
                AccountRecoveryStartRequest(email="missing@example.com"),
                self.db,
            )
            oauth_only = routes_recovery.start_account_recovery(
                AccountRecoveryStartRequest(email="oauth@example.com"),
                self.db,
            )
        finally:
            routes_recovery.redis_client = original_redis
            routes_recovery._secret = original_secret
            routes_recovery._send_otp = original_send
            routes_recovery._limit_recovery_subject = original_limit

        self.assertEqual(set(unknown), set(oauth_only))
        self.assertEqual(unknown["message"], oauth_only["message"])
        self.assertEqual(unknown["masked_email"], "m******@example.com")
        self.assertEqual(oauth_only["masked_email"], "o****@example.com")
        self.assertEqual(sent, [])
