import base64
import os
import unittest
from datetime import datetime, timedelta, timezone
from email import message_from_bytes
from unittest.mock import patch

import httpx
from cryptography.fernet import Fernet
from fastapi import HTTPException

from app.gmail_service import GmailDeliveryUncertain, decrypt_token, encrypt_token, send_gmail_message
from app.models import GmailCredential


class FakeQuery:
    def __init__(self, row):
        self.row = row

    def filter(self, *_conditions):
        return self

    def first(self):
        return self.row


class FakeDb:
    def __init__(self, row):
        self.row = row
        self.commits = 0

    def query(self, model):
        assert model is GmailCredential
        return FakeQuery(self.row)

    def commit(self):
        self.commits += 1

    def rollback(self):
        return None


class GmailServiceTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {
            "GOOGLE_TOKEN_ENCRYPTION_KEY": Fernet.generate_key().decode(),
            "GOOGLE_CLIENT_ID": "test-client",
            "GOOGLE_CLIENT_SECRET": "test-secret",
        })
        self.environment.start()
        self.row = GmailCredential(
            user_id=12,
            sender_email="sender@gmail.com",
            access_token_encrypted=encrypt_token("access-token"),
            refresh_token_encrypted=encrypt_token("refresh-token"),
            expires_at=datetime.now(timezone.utc) + timedelta(minutes=20),
        )
        self.db = FakeDb(self.row)

    def tearDown(self):
        self.environment.stop()

    @patch("app.gmail_service.httpx.post")
    def test_sends_rfc_email_from_connected_account_and_requires_provider_acceptance(self, post):
        post.return_value = httpx.Response(200, json={"id": "gmail-message-id"}, request=httpx.Request("POST", "https://gmail.googleapis.com"))
        result = send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(result, "gmail-message-id")
        self.assertEqual(post.call_args.args[0], "https://gmail.googleapis.com/gmail/v1/users/me/messages/send")
        self.assertEqual(post.call_args.kwargs["headers"]["Authorization"], "Bearer access-token")
        raw = post.call_args.kwargs["json"]["raw"]
        raw += "=" * (-len(raw) % 4)
        message = message_from_bytes(base64.urlsafe_b64decode(raw))
        self.assertEqual(message["From"], "sender@gmail.com")
        self.assertEqual(message["To"], "recipient@example.com")
        self.assertEqual(message["Subject"], "Shared file")

    @patch("app.gmail_service.httpx.post")
    def test_provider_rejection_is_reported_without_claiming_success(self, post):
        request = httpx.Request("POST", "https://gmail.googleapis.com")
        post.return_value = httpx.Response(429, json={"error": "quota"}, request=request)
        with self.assertRaises(HTTPException) as context:
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(context.exception.status_code, 503)
        self.assertIn("quota", context.exception.detail.lower())

    @patch("app.gmail_service.httpx.post", side_effect=httpx.TimeoutException("simulated timeout"))
    def test_timeout_is_classified_as_an_uncertain_send_outcome(self, _post):
        with self.assertRaises(GmailDeliveryUncertain):
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")

    @patch("app.gmail_service.httpx.post")
    def test_provider_server_error_is_classified_as_uncertain(self, post):
        post.return_value = httpx.Response(
            500,
            json={"error": "server error"},
            request=httpx.Request("POST", "https://gmail.googleapis.com"),
        )
        with self.assertRaises(GmailDeliveryUncertain):
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")

    def test_missing_connection_requires_gmail_authorization(self):
        with self.assertRaises(HTTPException) as context:
            send_gmail_message(FakeDb(None), 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(context.exception.status_code, 403)
        self.assertIn("Connect Gmail", context.exception.detail)

    @patch("app.gmail_service.httpx.post")
    def test_expired_access_token_refreshes_before_sending(self, post):
        self.row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        post.side_effect = [
            httpx.Response(200, json={"access_token": "fresh-access-token", "expires_in": 3600}, request=httpx.Request("POST", "https://oauth2.googleapis.com/token")),
            httpx.Response(200, json={"id": "gmail-message-id"}, request=httpx.Request("POST", "https://gmail.googleapis.com")),
        ]

        result = send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")

        self.assertEqual(result, "gmail-message-id")
        self.assertEqual(post.call_count, 2)
        self.assertEqual(post.call_args_list[1].kwargs["headers"]["Authorization"], "Bearer fresh-access-token")
        self.assertGreater(self.db.commits, 0)

    @patch("app.gmail_service.httpx.post")
    def test_expired_credential_without_refresh_token_is_rejected(self, post):
        self.row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        self.row.refresh_token_encrypted = None
        with self.assertRaises(HTTPException) as context:
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(context.exception.status_code, 403)
        self.assertIn("Reconnect Gmail", context.exception.detail)
        post.assert_not_called()

    @patch("app.gmail_service.httpx.post")
    def test_invalid_grant_refresh_error_is_sanitized_and_requires_reconnection(self, post):
        self.row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        post.return_value = httpx.Response(
            400,
            json={"error": "invalid_grant", "error_description": "sensitive provider detail"},
            request=httpx.Request("POST", "https://oauth2.googleapis.com/token"),
        )
        with self.assertRaises(HTTPException) as context:
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(context.exception.status_code, 403)
        self.assertIn("revoked or expired", context.exception.detail)
        self.assertNotIn("sensitive provider detail", context.exception.detail)
        self.assertEqual(post.call_count, 1)

    @patch("app.gmail_service.httpx.post")
    def test_other_refresh_errors_are_sanitized(self, post):
        for error_code in ("invalid_client", "unauthorized_client", "invalid_request"):
            with self.subTest(error=error_code):
                self.row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
                post.reset_mock()
                post.return_value = httpx.Response(
                    400,
                    json={
                        "error": error_code,
                        "error_description": "sensitive provider detail",
                    },
                    request=httpx.Request("POST", "https://oauth2.googleapis.com/token"),
                )

                with self.assertRaises(HTTPException) as context:
                    send_gmail_message(
                        self.db, 12, "recipient@example.com", "Shared file", "Secure link"
                    )

                self.assertEqual(context.exception.status_code, 403)
                self.assertNotIn("sensitive provider detail", context.exception.detail)
                self.assertEqual(post.call_count, 1)

    @patch("app.gmail_service.httpx.post")
    def test_refresh_rotates_encrypted_refresh_token_when_provider_returns_one(self, post):
        self.row.expires_at = datetime.now(timezone.utc) - timedelta(minutes=1)
        post.side_effect = [
            httpx.Response(
                200,
                json={
                    "access_token": "fresh-access-token",
                    "refresh_token": "rotated-refresh-token",
                    "expires_in": 3600,
                },
                request=httpx.Request("POST", "https://oauth2.googleapis.com/token"),
            ),
            httpx.Response(
                200,
                json={"id": "gmail-message-id"},
                request=httpx.Request("POST", "https://gmail.googleapis.com"),
            ),
        ]
        send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertNotEqual(self.row.refresh_token_encrypted, "rotated-refresh-token")
        self.assertEqual(decrypt_token(self.row.refresh_token_encrypted), "rotated-refresh-token")

    @patch("app.gmail_service.httpx.post")
    def test_gmail_401_and_malformed_success_never_claim_delivery(self, post):
        post.return_value = httpx.Response(
            401,
            json={"error": "unauthorized"},
            request=httpx.Request("POST", "https://gmail.googleapis.com"),
        )
        with self.assertRaises(HTTPException) as unauthorized:
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
        self.assertEqual(unauthorized.exception.status_code, 403)

        post.return_value = httpx.Response(
            200,
            json={"accepted": True},
            request=httpx.Request("POST", "https://gmail.googleapis.com"),
        )
        with self.assertRaises(GmailDeliveryUncertain):
            send_gmail_message(self.db, 12, "recipient@example.com", "Shared file", "Secure link")
