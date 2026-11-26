import os
import smtplib
import unittest
from unittest.mock import patch

from fastapi import HTTPException

from app.email_service import send_email, send_security_alert_emails


class EmailServiceTests(unittest.TestCase):
    def test_missing_configuration_is_reported_without_sending(self):
        with patch.dict(os.environ, {"SMTP_HOST": "", "SMTP_FROM": ""}):
            with self.assertRaises(HTTPException) as context:
                send_email("recipient@example.com", "Subject", "Body")
        self.assertEqual(context.exception.status_code, 503)
        self.assertIn("SMTP_HOST and SMTP_FROM", context.exception.detail)

    @patch("app.email_service.smtplib.SMTP")
    def test_sends_message_with_starttls_and_configured_sender(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        config = {
            "SMTP_HOST": "mail.example.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "mail-user",
            "SMTP_PASSWORD": "test-secret",
            "SMTP_FROM": "no-reply@example.com",
            "SMTP_USE_TLS": "true",
            "SMTP_USE_SSL": "false",
        }
        with patch.dict(os.environ, config):
            send_email("recipient@example.com", "TrustShare invite", "Invitation body")

        smtp.starttls.assert_called_once_with()
        smtp.login.assert_called_once_with("mail-user", "test-secret")
        message = smtp.send_message.call_args.args[0]
        self.assertEqual(message["To"], "recipient@example.com")
        self.assertEqual(message["From"], "no-reply@example.com")
        self.assertIn("Invitation body", message.get_content())

    @patch("app.email_service.smtplib.SMTP")
    def test_provider_error_is_sanitized(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        smtp.send_message.side_effect = smtplib.SMTPAuthenticationError(535, "provider-secret-detail")
        config = {
            "SMTP_HOST": "mail.example.com",
            "SMTP_PORT": "587",
            "SMTP_USERNAME": "",
            "SMTP_PASSWORD": "",
            "SMTP_FROM": "no-reply@example.com",
            "SMTP_USE_TLS": "false",
            "SMTP_USE_SSL": "false",
        }
        with patch.dict(os.environ, config):
            with self.assertRaises(HTTPException) as context:
                send_email("recipient@example.com", "Subject", "Body")
        self.assertNotIn("provider-secret-detail", context.exception.detail)

    @patch("app.email_service.send_email", side_effect=HTTPException(503, "offline"))
    def test_security_alert_email_failure_is_swallowed(self, send_mock):
        with patch.dict(os.environ, {"SECURITY_ALERT_EMAILS": "admin@example.com"}):
            send_security_alert_emails("repeated_failed_logins", 6, 600)
        send_mock.assert_called_once()

    @patch("app.email_service.smtplib.SMTP")
    def test_recipient_refusal_is_reported_as_delivery_failure(self, smtp_class):
        smtp = smtp_class.return_value.__enter__.return_value
        smtp.send_message.return_value = {"recipient@example.com": (550, b"refused")}
        config = {
            "SMTP_HOST": "mail.example.com", "SMTP_PORT": "587", "SMTP_USERNAME": "",
            "SMTP_PASSWORD": "", "SMTP_FROM": "no-reply@example.com",
            "SMTP_USE_TLS": "false", "SMTP_USE_SSL": "false",
        }
        with patch.dict(os.environ, config):
            with self.assertRaises(HTTPException):
                send_email("recipient@example.com", "Subject", "Body")

    @patch("app.email_service.smtplib.SMTP")
    def test_invalid_recipient_is_rejected_before_provider_connection(self, smtp_class):
        config = {
            "SMTP_HOST": "mail.example.com", "SMTP_PORT": "587", "SMTP_USERNAME": "",
            "SMTP_PASSWORD": "", "SMTP_FROM": "no-reply@example.com",
            "SMTP_USE_TLS": "false", "SMTP_USE_SSL": "false",
        }
        with patch.dict(os.environ, config):
            with self.assertRaises(HTTPException) as context:
                send_email("bad\r\nBcc: victim@example.com", "Subject", "Body")
        self.assertEqual(context.exception.status_code, 422)
        smtp_class.assert_not_called()


if __name__ == "__main__":
    unittest.main()
