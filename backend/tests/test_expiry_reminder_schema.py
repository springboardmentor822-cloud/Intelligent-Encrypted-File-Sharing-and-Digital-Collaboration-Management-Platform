import unittest

from sqlalchemy import create_engine, inspect, text
from unittest.mock import patch

from app.schema_migrations import (
    ensure_folder_share_email_columns,
    ensure_share_expiry_reminder_columns,
)


class ExpiryReminderSchemaTests(unittest.TestCase):
    def test_adds_delivery_states_without_losing_rows_and_can_rerun(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE file_shares (id INTEGER PRIMARY KEY)"))
            connection.execute(text("INSERT INTO file_shares (id) VALUES (32)"))

        with patch("app.schema_migrations.mysql_engine", engine):
            ensure_share_expiry_reminder_columns()
            ensure_share_expiry_reminder_columns()

        columns = {column["name"] for column in inspect(engine).get_columns("file_shares")}
        self.assertTrue({
            "reminder_90_sent_at", "reminder_90_claimed_at",
            "reminder_30_sent_at", "reminder_30_claimed_at",
            "reminder_90_state", "reminder_30_state",
        }.issubset(columns))
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT id, reminder_90_state, reminder_30_state FROM file_shares WHERE id = 32"
            )).one()
        self.assertEqual(row, (32, None, None))
        engine.dispose()

    def test_adds_folder_invitation_tracking_without_losing_rows_and_can_rerun(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("CREATE TABLE folder_shares (id INTEGER PRIMARY KEY)"))
            connection.execute(text("INSERT INTO folder_shares (id) VALUES (7)"))

        with patch("app.schema_migrations.mysql_engine", engine):
            ensure_folder_share_email_columns()
            ensure_folder_share_email_columns()

        columns = {column["name"]: column for column in inspect(engine).get_columns("folder_shares")}
        self.assertTrue({
            "email_status", "email_attempt_count", "email_attempted_at",
            "email_sent_at", "email_error_category",
        }.issubset(columns))
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT id, email_status, email_attempt_count FROM folder_shares WHERE id = 7"
            )).one()
        self.assertEqual(row, (7, "pending", 0))
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
