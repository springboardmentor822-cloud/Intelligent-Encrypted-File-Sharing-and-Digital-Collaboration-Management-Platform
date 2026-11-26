"""Safely add file share fields missing from older TrustShare databases.

Run from the backend directory with the project's Python environment:
    python migrations/file_share_schema.py

Existing invitation rows are retained; new columns receive model-compatible
defaults. The migration checks each column so it is safe to rerun.
"""

import secrets
import sys
from pathlib import Path

from sqlalchemy import inspect, text

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.database import mysql_engine


FILE_SHARE_COLUMNS = {
    "permission": "VARCHAR(20) NOT NULL DEFAULT 'download'",
    "revoked": "BOOLEAN NOT NULL DEFAULT FALSE",
    "share_token": "VARCHAR(64) NULL",
    "email_status": "VARCHAR(20) NOT NULL DEFAULT 'pending'",
    "email_attempt_count": "INT NOT NULL DEFAULT 0",
    "email_attempted_at": "DATETIME NULL",
    "email_sent_at": "DATETIME NULL",
    "email_error_category": "VARCHAR(40) NULL",
}


def reconcile_file_share_columns(engine):
    """Add only absent columns and return their names."""
    with engine.begin() as connection:
        inspector = inspect(connection)
        if not inspector.has_table("file_shares"):
            raise RuntimeError("file_shares does not exist; apply migration 002 first.")
        existing = {column["name"] for column in inspector.get_columns("file_shares")}
        added = []
        for name, definition in FILE_SHARE_COLUMNS.items():
            if name in existing:
                continue
            connection.execute(text(f"ALTER TABLE file_shares ADD COLUMN {name} {definition}"))
            added.append(name)
        for row in connection.execute(text("SELECT id FROM file_shares WHERE share_token IS NULL")):
            connection.execute(
                text("UPDATE file_shares SET share_token = :token WHERE id = :id"),
                {"id": row.id, "token": secrets.token_urlsafe(32)},
            )
        indexes = {index["name"] for index in inspect(connection).get_indexes("file_shares")}
        if "uq_file_share_token" not in indexes:
            connection.execute(text("CREATE UNIQUE INDEX uq_file_share_token ON file_shares (share_token)"))
        if connection.dialect.name == "mysql" and "share_token" in added:
            connection.execute(text("ALTER TABLE file_shares MODIFY COLUMN share_token VARCHAR(64) NOT NULL"))
        return added


if __name__ == "__main__":
    added = reconcile_file_share_columns(mysql_engine)
    if added:
        print("Added file_shares columns: " + ", ".join(added))
    else:
        print("file_shares already matches the current model; no changes needed.")
