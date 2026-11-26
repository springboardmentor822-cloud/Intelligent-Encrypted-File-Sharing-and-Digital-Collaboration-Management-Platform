import unittest
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from app import rotate_file_keys as rotation


class RotateFileKeysTests(unittest.TestCase):
    def setUp(self):
        self.old_file = SimpleNamespace(
            encryption_version=1,
            encryption_key_id="old",
            wrapped_data_key="old-wrapped",
        )
        self.active_file = SimpleNamespace(
            encryption_version=1,
            encryption_key_id="new",
            wrapped_data_key="already-active",
        )
        self.db = MagicMock()
        self.db.query.return_value.filter.return_value.all.return_value = [
            self.old_file,
            self.active_file,
        ]

    @patch.object(rotation, "_keyring", return_value=("new", {"old": object(), "new": object()}))
    @patch.object(rotation, "SessionLocal")
    @patch.object(rotation, "rewrap_data_key")
    def test_dry_run_does_not_modify_or_commit_files(
        self, rewrap, session_local, keyring
    ):
        session_local.return_value = self.db

        result = rotation.rotate_file_keys(apply=False)

        self.assertEqual(result, {
            "active_key_id": "new",
            "pending": 1,
            "rewrapped": 0,
        })
        rewrap.assert_not_called()
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()
        self.db.close.assert_called_once()

        self.assertEqual(self.old_file.encryption_key_id, "old")
        self.assertEqual(self.old_file.wrapped_data_key, "old-wrapped")

    @patch.object(rotation, "_keyring", return_value=("new", {"old": object(), "new": object()}))
    @patch.object(rotation, "SessionLocal")
    @patch.object(rotation, "rewrap_data_key", return_value=("new-wrapped", "new"))
    def test_apply_rewraps_only_pending_files(
        self, rewrap, session_local, keyring
    ):
        session_local.return_value = self.db

        result = rotation.rotate_file_keys(apply=True)

        self.assertEqual(result, {
            "active_key_id": "new",
            "pending": 1,
            "rewrapped": 1,
        })
        rewrap.assert_called_once_with("old-wrapped", "old")
        self.assertEqual(self.old_file.wrapped_data_key, "new-wrapped")
        self.assertEqual(self.old_file.encryption_key_id, "new")
        self.assertEqual(self.active_file.wrapped_data_key, "already-active")
        self.db.commit.assert_called_once()
        self.db.rollback.assert_not_called()
        self.db.close.assert_called_once()

    @patch.object(rotation, "_keyring", return_value=("new", {"old": object(), "new": object()}))
    @patch.object(rotation, "SessionLocal")
    @patch.object(rotation, "rewrap_data_key", return_value=("new-wrapped", "new"))
    def test_commit_failure_rolls_back_and_closes_session(
        self, rewrap, session_local, keyring
    ):
        session_local.return_value = self.db
        self.db.commit.side_effect = RuntimeError("database commit failed")

        with self.assertRaisesRegex(RuntimeError, "database commit failed"):
            rotation.rotate_file_keys(apply=True)

        self.db.rollback.assert_called_once()
        self.db.close.assert_called_once()

    @patch.object(rotation, "_keyring", return_value=("new", {"new": object()}))
    @patch.object(rotation, "SessionLocal")
    def test_no_pending_files_does_not_commit(self, session_local, keyring):
        session_local.return_value = self.db
        self.db.query.return_value.filter.return_value.all.return_value = [
            self.active_file
        ]

        result = rotation.rotate_file_keys(apply=True)

        self.assertEqual(result, {
            "active_key_id": "new",
            "pending": 0,
            "rewrapped": 0,
        })
        self.db.commit.assert_not_called()
        self.db.rollback.assert_not_called()
        self.db.close.assert_called_once()


if __name__ == "__main__":
    unittest.main()
