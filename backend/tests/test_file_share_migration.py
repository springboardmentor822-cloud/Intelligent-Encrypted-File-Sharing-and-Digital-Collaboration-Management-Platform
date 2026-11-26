import unittest

from sqlalchemy import create_engine, text

from migrations.file_share_schema import reconcile_file_share_columns


class FileShareMigrationTests(unittest.TestCase):
    def test_adds_missing_fields_without_losing_rows_and_can_rerun(self):
        engine = create_engine("sqlite:///:memory:")
        with engine.begin() as connection:
            connection.execute(text("""
                CREATE TABLE file_shares (
                    id INTEGER PRIMARY KEY,
                    file_id INTEGER NOT NULL,
                    owner_id INTEGER NOT NULL,
                    recipient_email VARCHAR(255) NOT NULL,
                    created_at DATETIME NOT NULL
                )
            """))
            connection.execute(text("""
                INSERT INTO file_shares (id, file_id, owner_id, recipient_email, created_at)
                VALUES (7, 12, 3, 'recipient@example.com', '2025-01-01 00:00:00')
            """))

        added = reconcile_file_share_columns(engine)
        self.assertEqual(set(added), {
            "permission", "revoked", "share_token", "email_status", "email_attempt_count",
            "email_attempted_at", "email_sent_at", "email_error_category",
        })
        with engine.connect() as connection:
            row = connection.execute(text(
                "SELECT id, file_id, owner_id, recipient_email, permission, revoked, "
                "email_status, email_attempt_count, share_token FROM file_shares WHERE id = 7"
            )).one()
        self.assertEqual(row[:4], (7, 12, 3, "recipient@example.com"))
        self.assertEqual(row[4:8], ("download", 0, "pending", 0))
        self.assertEqual(len(row[8]), 43)
        self.assertEqual(reconcile_file_share_columns(engine), [])
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
