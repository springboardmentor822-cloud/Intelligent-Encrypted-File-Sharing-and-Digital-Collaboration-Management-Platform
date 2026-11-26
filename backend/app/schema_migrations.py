"""Additive, restart-safe schema upgrades that preserve existing rows."""

from sqlalchemy import inspect, text

from app.database import mysql_engine


def ensure_milestone2_columns() -> None:
    additions = {
        "stored_files": {
            "encryption_version": "INTEGER NOT NULL DEFAULT 0",
            "wrapped_data_key": "VARCHAR(512) NULL",
            "encryption_key_id": "VARCHAR(100) NULL",
            "storage_backend": "VARCHAR(20) NOT NULL DEFAULT 'local'",
        },
        "file_shares": {"expires_at": "DATETIME NULL"},
    }
    with mysql_engine.begin() as connection:
        inspector = inspect(connection)
        for table, columns in additions.items():
            if not inspector.has_table(table):
                continue
            present = {column["name"] for column in inspector.get_columns(table)}
            for name, definition in columns.items():
                if name not in present:
                    connection.execute(text(f"ALTER TABLE `{table}` ADD COLUMN `{name}` {definition}"))
                    present.add(name)


def ensure_share_expiry_reminder_columns() -> None:
    additions = {
        "reminder_90_sent_at": "DATETIME NULL",
        "reminder_90_claimed_at": "DATETIME NULL",
        "reminder_30_sent_at": "DATETIME NULL",
        "reminder_30_claimed_at": "DATETIME NULL",
        "reminder_90_state": "VARCHAR(20) NULL",
        "reminder_30_state": "VARCHAR(20) NULL",
    }
    with mysql_engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("file_shares"):
            return
        present = {column["name"] for column in inspector.get_columns("file_shares")}
        for name, definition in additions.items():
            if name not in present:
                connection.execute(text(f"ALTER TABLE `file_shares` ADD COLUMN `{name}` {definition}"))
                present.add(name)


def ensure_folder_share_email_columns() -> None:
    additions = {
        "email_status": "VARCHAR(20) NOT NULL DEFAULT 'pending'",
        "email_attempt_count": "INTEGER NOT NULL DEFAULT 0",
        "email_attempted_at": "DATETIME NULL",
        "email_sent_at": "DATETIME NULL",
        "email_error_category": "VARCHAR(40) NULL",
    }
    with mysql_engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("folder_shares"):
            return
        present = {column["name"] for column in inspector.get_columns("folder_shares")}
        for name, definition in additions.items():
            if name not in present:
                connection.execute(text(f"ALTER TABLE `folder_shares` ADD COLUMN `{name}` {definition}"))
                present.add(name)
