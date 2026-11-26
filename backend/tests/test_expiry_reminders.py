import asyncio
import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from unittest.mock import AsyncMock

from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.database import Base
from app.expiry_reminders import send_file_share_expiry_reminders
from app.gmail_service import GmailDeliveryUncertain
from app.main import _expiry_reminder_loop
import app.main as main
from app.models import FileShare, StoredFile, User


class FileShareExpiryReminderTests(unittest.TestCase):
    def setUp(self):
        self.engine = create_engine(
            "sqlite://",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(self.engine)
        self.session = sessionmaker(bind=self.engine)()
        self.now = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
        self.owner = User(id=1, full_name="Owner", email="owner@example.com", role="user")
        self.recipient = User(id=2, full_name="Recipient", email="recipient@example.com", role="user")
        self.file = StoredFile(
            id=3,
            original_name="report.pdf",
            stored_name="stored-report",
            content_type="application/pdf",
            size_bytes=10,
            owner_id=self.owner.id,
        )
        self.other_file = StoredFile(
            id=8,
            original_name="notes.txt",
            stored_name="stored-notes",
            content_type="text/plain",
            size_bytes=10,
            owner_id=self.owner.id,
        )
        self.session.add_all([self.owner, self.recipient, self.file, self.other_file])
        self.session.commit()

    def tearDown(self):
        self.session.close()
        self.engine.dispose()

    def add_share(self, expires_at, share_id=4, token="token", file_id=None):
        share = FileShare(
            id=share_id,
            share_token=token,
            file_id=file_id or self.file.id,
            owner_id=self.owner.id,
            recipient_email=self.recipient.email,
            permission="download",
            expires_at=expires_at,
        )
        self.session.add(share)
        self.session.commit()
        return share

    def test_sends_90_minute_reminder_once_to_recipient(self):
        share = self.add_share(self.now + timedelta(minutes=89))

        with patch("app.expiry_reminders.send_gmail_message", return_value="message-id") as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 1)
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)

        send.assert_called_once()
        self.assertEqual(send.call_args.args[:3], (self.session, self.owner.id, self.recipient.email))
        self.assertIn("90 minutes", send.call_args.args[3])
        self.assertIn("report.pdf", send.call_args.args[4])
        self.session.refresh(share)
        self.assertIsNotNone(share.reminder_90_sent_at)

    def test_sends_30_minute_reminder_after_90_minute_window(self):
        share = self.add_share(self.now + timedelta(minutes=89))

        with patch("app.expiry_reminders.send_gmail_message", return_value="message-id") as send:
            send_file_share_expiry_reminders(self.session, now=self.now)
            self.assertEqual(
                send_file_share_expiry_reminders(
                    self.session,
                    now=self.now + timedelta(minutes=60),
                ),
                1,
            )

        self.assertEqual(send.call_count, 2)
        self.assertIn("30 minutes", send.call_args.args[3])
        self.session.refresh(share)
        self.assertIsNotNone(share.reminder_30_sent_at)

    def test_skips_unexpired_missing_expiry_revoked_and_owner_shares(self):
        self.add_share(None)
        revoked = self.add_share(
            self.now + timedelta(minutes=30),
            share_id=5,
            token="revoked-token",
            file_id=self.other_file.id,
        )
        revoked.revoked = True
        owner_share = FileShare(
            id=7,
            share_token="owner-token",
            file_id=self.file.id,
            owner_id=self.owner.id,
            recipient_email=self.owner.email,
            permission="download",
            expires_at=self.now + timedelta(minutes=30),
        )
        self.session.add(owner_share)
        self.session.commit()

        with patch("app.expiry_reminders.send_gmail_message") as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
        send.assert_not_called()

    def test_skips_expired_shares_and_retries_failed_delivery(self):
        expired = self.add_share(self.now - timedelta(seconds=1))
        self.session.refresh(expired)
        with patch("app.expiry_reminders.send_gmail_message") as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
        send.assert_not_called()

        retry = FileShare(
            id=6,
            share_token="retry-token",
            file_id=self.other_file.id,
            owner_id=self.owner.id,
            recipient_email=self.recipient.email,
            permission="view",
            expires_at=self.now + timedelta(minutes=20),
        )
        self.session.add(retry)
        self.session.commit()
        with patch(
            "app.expiry_reminders.send_gmail_message",
            side_effect=[HTTPException(status_code=503), "message-id"],
        ) as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 1)
        self.session.refresh(retry)
        self.assertIsNone(retry.reminder_30_claimed_at)
        self.assertIsNotNone(retry.reminder_30_sent_at)

    def test_active_lease_blocks_duplicate_and_stale_lease_becomes_uncertain(self):
        share = self.add_share(self.now + timedelta(minutes=20))
        share.reminder_30_claimed_at = self.now.replace(tzinfo=None) - timedelta(minutes=5)
        share.reminder_30_state = "sending"
        self.session.commit()

        with patch("app.expiry_reminders.send_gmail_message") as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
        send.assert_not_called()

        with patch("app.expiry_reminders.send_gmail_message") as send:
            self.assertEqual(
                send_file_share_expiry_reminders(self.session, now=self.now + timedelta(minutes=11)),
                0,
            )
        send.assert_not_called()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "uncertain")
        self.assertIsNone(share.reminder_30_claimed_at)

    def test_crash_after_provider_acceptance_does_not_resend(self):
        share = self.add_share(self.now + timedelta(minutes=20))
        with patch("app.expiry_reminders.send_gmail_message", return_value="accepted") as send, \
             patch("app.expiry_reminders._mark_sent", side_effect=RuntimeError("simulated DB commit failure")):
            with self.assertRaises(RuntimeError):
                send_file_share_expiry_reminders(self.session, now=self.now)
        send.assert_called_once()
        self.session.rollback()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "sending")
        self.assertIsNone(share.reminder_30_sent_at)

        with patch("app.expiry_reminders.send_gmail_message") as retry:
            self.assertEqual(
                send_file_share_expiry_reminders(self.session, now=self.now + timedelta(minutes=11)),
                0,
            )
            self.assertEqual(
                send_file_share_expiry_reminders(self.session, now=self.now + timedelta(minutes=12)),
                0,
            )
        retry.assert_not_called()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "uncertain")

    def test_crash_after_lease_commit_before_provider_call_recovers_as_uncertain(self):
        share = self.add_share(self.now + timedelta(minutes=20))
        with patch(
            "app.expiry_reminders._send_one",
            side_effect=RuntimeError("simulated worker crash before provider call"),
        ):
            with self.assertRaises(RuntimeError):
                send_file_share_expiry_reminders(self.session, now=self.now)
        self.session.rollback()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "sending")
        self.assertIsNotNone(share.reminder_30_claimed_at)

        with patch("app.expiry_reminders.send_gmail_message") as send:
            self.assertEqual(
                send_file_share_expiry_reminders(
                    self.session,
                    now=self.now + timedelta(minutes=11),
                ),
                0,
            )
        send.assert_not_called()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "uncertain")

    def test_uncertain_provider_outcome_is_never_retried_automatically(self):
        share = self.add_share(self.now + timedelta(minutes=20))
        with patch(
            "app.expiry_reminders.send_gmail_message",
            side_effect=GmailDeliveryUncertain(),
        ) as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
            self.assertEqual(
                send_file_share_expiry_reminders(self.session, now=self.now + timedelta(minutes=11)),
                0,
            )
        send.assert_called_once()
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "uncertain")

    def test_known_provider_rejection_remains_retryable(self):
        share = self.add_share(self.now + timedelta(minutes=20))
        with patch(
            "app.expiry_reminders.send_gmail_message",
            side_effect=[HTTPException(status_code=403), "accepted"],
        ) as send:
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 0)
            self.session.refresh(share)
            self.assertEqual(share.reminder_30_state, "retryable")
            self.assertEqual(send_file_share_expiry_reminders(self.session, now=self.now), 1)
        self.assertEqual(send.call_count, 2)
        self.session.refresh(share)
        self.assertEqual(share.reminder_30_state, "sent")


class ExpirySchedulerLoopTests(unittest.IsolatedAsyncioTestCase):
    async def _run_one_cycle(self, configured_interval, expected_interval):
        env = {} if configured_interval is None else {"SHARE_EXPIRY_REMINDER_INTERVAL_SECONDS": configured_interval}
        with patch.dict(os.environ, env, clear=True), \
             patch("app.main.asyncio.to_thread", new_callable=AsyncMock) as run_cycle, \
             patch("app.main.asyncio.sleep", new_callable=AsyncMock, side_effect=asyncio.CancelledError) as sleep:
            with self.assertRaises(asyncio.CancelledError):
                await _expiry_reminder_loop()
        run_cycle.assert_awaited_once()
        sleep.assert_awaited_once_with(expected_interval)

    async def test_default_and_invalid_intervals_use_sixty_seconds(self):
        await self._run_one_cycle(None, 60)
        await self._run_one_cycle("broken", 60)

    async def test_configured_interval_is_used_and_short_intervals_are_clamped(self):
        await self._run_one_cycle("75", 75)
        await self._run_one_cycle("5", 60)

    async def test_application_lifespan_initializes_services_and_cancels_worker(self):
        loop_started = asyncio.Event()

        async def waiting_worker():
            loop_started.set()
            await asyncio.Event().wait()

        with patch("app.main.test_connections") as connections, \
             patch("app.main.ensure_activity_indexes") as indexes, \
             patch.object(Base.metadata, "create_all") as create_tables, \
             patch("app.main.ensure_milestone2_columns") as milestone_migration, \
             patch("app.main.ensure_share_expiry_reminder_columns") as reminder_migration, \
             patch("app.main.ensure_folder_share_email_columns") as folder_email_migration, \
             patch("app.main._expiry_reminder_loop", new=waiting_worker), \
             patch("app.main.mysql_engine.dispose") as mysql_dispose, \
             patch("app.main.mongo_client.close") as mongo_close, \
             patch("app.main.redis_client.close") as redis_close:
            async with main.lifespan(main.app):
                await asyncio.wait_for(loop_started.wait(), timeout=1)

        connections.assert_called_once()
        indexes.assert_called_once()
        create_tables.assert_called_once_with(bind=main.mysql_engine)
        milestone_migration.assert_called_once()
        reminder_migration.assert_called_once()
        folder_email_migration.assert_called_once()
        mysql_dispose.assert_called_once()
        mongo_close.assert_called_once()
        redis_close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
