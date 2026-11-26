import io
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch
from pathlib import Path
from types import SimpleNamespace
import asyncio

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient
from sqlalchemy.exc import IntegrityError

import app.auth as auth
import app.database as database
import app.routes_folders as routes_folders
import app.routes_files as routes_files
from app.models import Favorite, FileShare, Folder, FolderShare, GmailCredential, StoredFile, User
from app.routes_files import (
    delete_file,
    download_file,
    get_storage_summary,
    get_used_storage,
    list_files,
    move_file,
    upload_file,
    list_shared_files,
    revoke_file_share,
    share_file,
    retry_share_invitation,
    download_shared_file,
    download_shared_file_with_password,
    download_file_with_passwords,
    get_shared_file_info,
    storage_path,
    validate_file_content,
)
from app.gmail_service import GmailDeliveryUncertain
from app.routes_folders import hash_folder_password
from app.schemas import FileDownloadRequest, FileShareRequest, FolderUnlockRequest


class FakeQuery:
    def __init__(self, records):
        self.records = records
        self.conditions = []

    def filter(self, *conditions):
        self.conditions.extend(conditions)
        return self

    def order_by(self, *_args):
        return self

    def with_for_update(self):
        return self

    def _matches(self, record):
        for condition in self.conditions:
            key = getattr(condition.left, "key", None)
            expected = getattr(condition.right, "value", None)

            if key is not None and getattr(record, key) != expected:
                return False

        return True

    def all(self):
        return [record for record in self.records if self._matches(record)]

    def first(self):
        return next(iter(self.all()), None)


class FakeDb:
    def __init__(self, records):
        self.records = records
        self.deleted = []
        self.committed = False

    def query(self, _model):
        if _model is Favorite.file_id or _model is Favorite.folder_id:
            return FakeQuery([])
        return FakeQuery(self.records)

    def add(self, record):
        record.id = 99
        self.records.append(record)

    def refresh(self, _record):
        return None

    def delete(self, record):
        self.deleted.append(record)
        self.records.remove(record)

    def commit(self):
        self.committed = True

    def rollback(self):
        self.committed = False


class SharingFakeDb:
    def __init__(self, owner, recipient, file_record, folder=None):
        self.users = [owner, recipient]
        self.files = [file_record]
        self.folders = [folder] if folder else []
        self.shares = []
        self.gmail_credentials = [SimpleNamespace(user_id=owner.id, sender_email=owner.email)]
        self.committed = False

    def query(self, model):
        if model is Favorite.file_id or model is Favorite.folder_id:
            field = model.key
            return FakeQuery([
                SimpleNamespace(**{field: getattr(row, field)})
                for row in getattr(self, "favorites", [])
                if getattr(row, field) is not None
            ])
        records = {
            User: self.users,
            StoredFile: self.files,
            Folder: self.folders,
            FolderShare: getattr(self, "folder_shares", []),
            FileShare: self.shares,
            GmailCredential: self.gmail_credentials,
        }[model]
        return FakeQuery(records)

    def add(self, record):
        record.id = 50 + len(self.shares)
        self.shares.append(record)

    def commit(self):
        self.committed = True

    def refresh(self, _record):
        return None

    def rollback(self):
        self.committed = False

    def delete(self, record):
        self.files.remove(record)


class MoveFakeDb:
    def __init__(self, file_record, folder):
        self.file_record = file_record
        self.folder = folder

    def query(self, model):
        return FakeQuery([self.file_record] if model is StoredFile else [self.folder])

    def commit(self):
        return None

    def refresh(self, _record):
        return None


class FileValidationTests(unittest.TestCase):
    def upload(self, content, filename):
        return UploadFile(file=io.BytesIO(content), filename=filename)

    def test_accepts_pdf_signature(self):
        file = self.upload(b"%PDF-1.7\ncontent", "report.pdf")
        validate_file_content(file, ".pdf")

    def test_rejects_mismatched_content(self):
        file = self.upload(b"not a pdf", "report.pdf")

        with self.assertRaises(HTTPException) as context:
            validate_file_content(file, ".pdf")

        self.assertEqual(context.exception.status_code, 415)

    def test_rejects_empty_content(self):
        file = self.upload(b"", "empty.txt")

        with self.assertRaises(HTTPException) as context:
            validate_file_content(file, ".txt")

        self.assertEqual(context.exception.status_code, 400)

    def test_rejects_path_traversal_storage_name(self):
        with self.assertRaises(HTTPException) as context:
            storage_path("../outside.upload")

        self.assertEqual(context.exception.status_code, 404)


class FileOwnershipTests(unittest.TestCase):
    def setUp(self):
        self.user_a = SimpleNamespace(id=101)
        self.user_b = SimpleNamespace(id=202)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.temp_dir.name)
        self.original_upload_dir = routes_files.UPLOAD_DIR
        routes_files.UPLOAD_DIR = self.upload_dir

    def tearDown(self):
        routes_files.UPLOAD_DIR = self.original_upload_dir
        self.temp_dir.cleanup()

    def file_record(self):
        stored_name = "owned-file.upload"
        (self.upload_dir / stored_name).write_bytes(b"private file")
        return SimpleNamespace(
            id=7,
            owner_id=self.user_a.id,
            original_name="private.txt",
            stored_name=stored_name,
            content_type="text/plain",
            size_bytes=12,
            created_at=None,
        )

    def test_owner_can_list_and_download_own_file(self):
        record = self.file_record()
        db = FakeDb([record])

        listed = list_files(current_user=self.user_a, db=db)
        response = download_file(
            file_id=record.id,
            current_user=self.user_a,
            db=db,
        )

        self.assertEqual([item["id"] for item in listed], [record.id])
        self.assertEqual(response.path, str(self.upload_dir / record.stored_name))

    def test_unsupported_preview_is_rejected_before_storage_retrieval(self):
        record = self.file_record()
        record.original_name = "archive.zip"

        with patch.object(routes_files.storage_service, "get_object") as storage_mock:
            with self.assertRaises(HTTPException) as context:
                routes_files.preview_file(
                    file_id=record.id,
                    data=FileDownloadRequest(),
                    current_user=self.user_a,
                    db=FakeDb([record]),
                )

        self.assertEqual(context.exception.status_code, 415)
        storage_mock.assert_not_called()

    def test_preview_returns_validated_mime_and_inline_headers(self):
        record = self.file_record()
        record.original_name = "document.docx"
        record.content_type = "application/octet-stream"

        response = routes_files.preview_file(
            file_id=record.id,
            data=FileDownloadRequest(),
            current_user=self.user_a,
            db=FakeDb([record]),
        )

        self.assertEqual(
            response.media_type,
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )
        self.assertEqual(
            response.headers["content-disposition"],
            "inline; filename*=UTF-8''document.docx",
        )
        self.assertEqual(response.headers["x-content-type-options"], "nosniff")


    def test_shared_download_records_activity_with_owner_metadata(self):
        record = self.file_record()

        with patch.object(routes_files, "record_activity") as activity_mock, patch.object(routes_files, "create_notification") as notification_mock:
            response = routes_files.file_download_response(
                record,
                requester_id=self.user_b.id,
            )

            self.assertIsNotNone(response.background)
            asyncio.run(response.background())

        activity_mock.assert_called_once_with(
            "file_download_success",
            self.user_b.id,
            file_id=record.id,
            resource_owner_id=self.user_a.id,
            shared_download=True,
        )
        notification_mock.assert_called_once()
        self.assertEqual(notification_mock.call_args.args[0], self.user_a.id)
        self.assertEqual(notification_mock.call_args.args[3], "shared_file_download")

    def test_storage_failure_records_one_failed_download(self):
        record = self.file_record()

        with patch.object(
            routes_files.storage_service,
            "get_object",
            side_effect=HTTPException(status_code=503, detail="storage unavailable"),
        ), patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException):
                routes_files.file_download_response(record, self.user_a.id)

        activity_mock.assert_called_once_with(
            "file_download_failed",
            self.user_a.id,
            file_id=record.id,
            resource_owner_id=record.owner_id,
            shared_download=False,
            details="File download failed: storage_retrieval.",
            status="failed",
            severity="warning",
        )

    def test_decryption_failure_records_failed_download(self):
        from app.services.encryption_service import FileEncryptionError

        record = self.file_record()
        record.encryption_version = 1
        record.wrapped_data_key = "wrapped-key"
        record.encryption_key_id = "key-id"

        with patch.object(
            routes_files,
            "decrypt_file",
            side_effect=FileEncryptionError("invalid ciphertext"),
        ), patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                routes_files.file_download_response(record, self.user_a.id)

        self.assertEqual(context.exception.status_code, 500)
        self.assertEqual(activity_mock.call_args.args[0], "file_download_failed")
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: integrity_verification.",
        )
        self.assertNotIn("invalid ciphertext", str(activity_mock.call_args))

    def test_missing_encryption_key_records_failed_download(self):
        record = self.file_record()
        record.encryption_version = 1
        record.wrapped_data_key = "test-wrapped-key"
        record.encryption_key_id = "test-key-id"

        with patch.object(
            routes_files.storage_service,
            "get_object",
            return_value=b"encrypted-content",
        ), patch.object(
            routes_files,
            "decrypt_file",
            side_effect=routes_files.EncryptionConfigurationError("test"),
        ), patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                routes_files.file_download_response(record, self.user_a.id)

        self.assertEqual(context.exception.status_code, 503)
        activity_mock.assert_called_once()
        self.assertEqual(activity_mock.call_args.args[0], "file_download_failed")
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: decryption_key_unavailable.",
        )

    def test_legacy_file_requires_migration_and_records_failure(self):
        record = self.file_record()
        record.encryption_version = 0
        record.storage_backend = "local"

        with patch.dict("os.environ", {"ALLOW_LEGACY_PLAINTEXT_DOWNLOADS": "false"}):
            with patch.object(
                routes_files.storage_service,
                "get_object",
                return_value=b"legacy-content",
            ), patch.object(routes_files, "record_activity") as activity_mock:
                with self.assertRaises(HTTPException) as context:
                    routes_files.file_download_response(record, self.user_a.id)

        self.assertEqual(context.exception.status_code, 409)
        activity_mock.assert_called_once()
        self.assertEqual(activity_mock.call_args.args[0], "file_download_failed")
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: legacy_storage_migration_required.",
        )

    def test_unsupported_encryption_version_records_failed_download(self):
        record = self.file_record()
        record.encryption_version = 99

        with patch.object(
            routes_files.storage_service,
            "get_object",
            return_value=b"unsupported-content",
        ), patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                routes_files.file_download_response(record, self.user_a.id)

        self.assertEqual(context.exception.status_code, 500)
        activity_mock.assert_called_once()
        self.assertEqual(activity_mock.call_args.args[0], "file_download_failed")
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: unsupported_encryption_version.",
        )

    def test_preview_records_preview_activity(self):
        record = self.file_record()

        with patch.object(routes_files, "record_activity") as activity_mock:
            response = routes_files.file_download_response(
                record,
                requester_id=self.user_b.id,
                inline=True,
            )

            self.assertEqual(response.body, b"private file")
            self.assertIsNotNone(response.background)
            asyncio.run(response.background())

        activity_mock.assert_called_once_with(
            "file_preview_success",
            self.user_b.id,
            file_id=record.id,
            resource_owner_id=self.user_a.id,
        )

    def test_other_user_cannot_download_owners_file(self):
        record = self.file_record()

        with patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                download_file(
                    file_id=record.id,
                    current_user=self.user_b,
                    db=FakeDb([record]),
                )

        self.assertEqual(context.exception.status_code, 404)
        activity_mock.assert_called_once()
        self.assertEqual(activity_mock.call_args.args[0], "unauthorized_access")
        self.assertTrue((self.upload_dir / record.stored_name).exists())

    def test_other_user_cannot_delete_owners_file(self):
        record = self.file_record()
        db = FakeDb([record])

        with self.assertRaises(HTTPException) as context:
            delete_file(
                file_id=record.id,
                current_user=self.user_b,
                db=db,
            )

        self.assertEqual(context.exception.status_code, 404)
        self.assertFalse(db.deleted)
        self.assertTrue((self.upload_dir / record.stored_name).exists())

    def test_other_user_cannot_modify_file_folder_metadata(self):
        record = self.file_record()
        record.folder_id = None
        db = FakeDb([record])
        with self.assertRaises(HTTPException) as context:
            move_file(
                file_id=record.id,
                folder_id=None,
                current_user=self.user_b,
                db=db,
            )
        self.assertEqual(context.exception.status_code, 404)
        self.assertIsNone(record.folder_id)
        self.assertFalse(db.committed)


class StorageAccountingTests(unittest.TestCase):
    def setUp(self):
        self.user_a = SimpleNamespace(id=101)
        self.temp_dir = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.temp_dir.name)
        self.original_upload_dir = routes_files.UPLOAD_DIR
        routes_files.UPLOAD_DIR = self.upload_dir

    def tearDown(self):
        routes_files.UPLOAD_DIR = self.original_upload_dir
        self.temp_dir.cleanup()

    def file_record(self):
        stored_name = "accounted-file.upload"
        (self.upload_dir / stored_name).write_bytes(b"private file")
        return SimpleNamespace(
            id=9,
            owner_id=self.user_a.id,
            original_name="private.txt",
            stored_name=stored_name,
            content_type="text/plain",
            size_bytes=12,
            folder_id=None,
            created_at=None,
        )

    def test_storage_uses_actual_file_bytes_and_counts_folder_files_once(self):
        record = self.file_record()
        record.folder_id = 77
        record.size_bytes = 12
        db = FakeDb([record])

        self.assertEqual(get_used_storage(self.user_a.id, db), 12)
        record.folder_id = None
        self.assertEqual(get_used_storage(self.user_a.id, db), 12)

    def test_storage_summary_reports_nonnegative_remaining_and_total_bytes(self):
        record = self.file_record()
        record.size_bytes = 12
        policy = {
            "per_user_storage_quota_bytes": routes_files.USER_STORAGE_QUOTA_BYTES,
            "max_upload_size_bytes": routes_files.MAX_FILE_SIZE,
            "allowed_file_extensions": sorted(routes_files.ALLOWED_FILE_EXTENSIONS),
        }
        with patch.object(routes_files, "get_platform_settings", return_value=policy):
            summary = get_storage_summary(current_user=self.user_a, db=FakeDb([record]))

        self.assertEqual(summary["used_bytes"], 12)
        self.assertEqual(summary["total_bytes"], routes_files.USER_STORAGE_QUOTA_BYTES)
        self.assertEqual(summary["remaining_bytes"], routes_files.USER_STORAGE_QUOTA_BYTES - 12)

    def test_storage_summary_fails_loudly_for_size_mismatch(self):
        record = self.file_record()
        record.size_bytes = 11

        with self.assertRaises(HTTPException) as context:
            get_used_storage(self.user_a.id, FakeDb([record]))

        self.assertEqual(context.exception.status_code, 503)

    def test_storage_is_owner_scoped_and_remaining_never_negative(self):
        record = self.file_record()
        record.size_bytes = 12
        db = FakeDb([record])
        policy = {
            "per_user_storage_quota_bytes": 5,
            "max_upload_size_bytes": routes_files.MAX_FILE_SIZE,
            "allowed_file_extensions": sorted(routes_files.ALLOWED_FILE_EXTENSIONS),
        }
        with patch.object(routes_files, "get_platform_settings", return_value=policy):
            self.assertEqual(get_storage_summary(current_user=SimpleNamespace(id=202), db=db)["used_bytes"], 0)
            summary = get_storage_summary(current_user=self.user_a, db=db)
        self.assertEqual(summary["remaining_bytes"], 0)

    def test_move_between_folders_does_not_change_usage(self):
        record = self.file_record()
        record.password_hash = None
        folder = SimpleNamespace(id=77, owner_id=self.user_a.id, password_hash=None)
        db = MoveFakeDb(record, folder)
        before = get_used_storage(self.user_a.id, db)
        move_file(file_id=record.id, folder_id=77, password=None, destination_password=None, current_user=self.user_a, db=db)
        self.assertEqual(get_used_storage(self.user_a.id, db), before)

    def test_delete_removes_file_before_storage_record_is_removed(self):
        record = self.file_record()
        record.password_hash = None
        db = FakeDb([record])
        with patch.object(routes_files, "record_activity") as activity_mock:
            delete_file(file_id=record.id, password=None, folder_password=None, current_user=self.user_a, db=db)
        self.assertFalse((self.upload_dir / record.stored_name).exists())
        self.assertEqual(get_used_storage(self.user_a.id, db), 0)
        self.assertEqual(activity_mock.call_args.args[0], "file_delete_success")

    def test_azure_delete_removes_blob_before_committing_record_removal(self):
        record = self.file_record()
        record.password_hash = None
        record.storage_backend = "azure"
        db = FakeDb([record])
        events = []

        def fake_get_object(key, backend):
            events.append(("get", key, backend))
            return b"encrypted-backup"

        def fake_delete_object(key, backend):
            events.append(("delete", key, backend))

        original_delete = db.delete

        def tracked_delete(item):
            events.append(("db_delete", item.id))
            original_delete(item)

        def tracked_commit():
            events.append(("commit",))
            db.committed = True

        db.delete = tracked_delete
        db.commit = tracked_commit

        with patch.object(
            routes_files.storage_service, "get_object", side_effect=fake_get_object
        ), patch.object(
            routes_files.storage_service, "delete_object", side_effect=fake_delete_object
        ), patch.object(
            routes_files, "record_activity"
        ) as activity_mock:
            delete_file(
                file_id=record.id,
                password=None,
                folder_password=None,
                current_user=self.user_a,
                db=db,
            )

        self.assertEqual(
            events,
            [
                ("get", record.stored_name, "azure"),
                ("delete", record.stored_name, "azure"),
                ("db_delete", record.id),
                ("commit",),
            ],
        )
        self.assertEqual(db.records, [])
        self.assertTrue(db.committed)
        activity_mock.assert_called_once()
        self.assertEqual(activity_mock.call_args.args[0], "file_delete_success")

    def test_azure_delete_restores_blob_when_database_commit_fails(self):
        record = self.file_record()
        record.password_hash = None
        record.storage_backend = "azure"
        db = FakeDb([record])
        backup = b"original-encrypted-blob"
        restored = []

        def fail_commit():
            raise RuntimeError("simulated database commit failure")

        db.commit = fail_commit

        with patch.object(
            routes_files.storage_service, "get_object", return_value=backup
        ), patch.object(
            routes_files.storage_service, "delete_object"
        ) as delete_mock, patch.object(
            routes_files.storage_service, "put_object",
            side_effect=lambda key, data, backend: restored.append((key, data, backend)),
        ) as restore_mock, patch.object(
            routes_files, "record_activity"
        ) as activity_mock:
            with self.assertRaises(HTTPException) as context:
                delete_file(
                    file_id=record.id,
                    password=None,
                    folder_password=None,
                    current_user=self.user_a,
                    db=db,
                )

        self.assertEqual(context.exception.status_code, 500)
        delete_mock.assert_called_once_with(record.stored_name, "azure")
        restore_mock.assert_called_once_with(record.stored_name, backup, "azure")
        self.assertEqual(restored, [(record.stored_name, backup, "azure")])
        self.assertFalse(db.committed)
        self.assertEqual(db.records, [])
        activity_mock.assert_not_called()

    def test_failed_upload_leaves_no_record_or_stored_bytes(self):
        from fastapi import UploadFile

        db = FakeDb([])
        policy = {
            "max_upload_size_bytes": 3,
            "per_user_storage_quota_bytes": routes_files.USER_STORAGE_QUOTA_BYTES,
            "allowed_file_extensions": sorted(routes_files.ALLOWED_FILE_EXTENSIONS),
        }
        with patch.object(routes_files, "get_platform_settings", return_value=policy):
            with self.assertRaises(HTTPException):
                upload_file(
                    file=UploadFile(file=io.BytesIO(b"more than three bytes"), filename="file.txt"),
                    password=None, current_user=self.user_a, folder_id=None, folder_password=None, db=db,
                )
        self.assertEqual(db.records, [])
        self.assertEqual(list(self.upload_dir.iterdir()), [])

    def test_upload_stores_authenticated_ciphertext_and_download_decrypts_it(self):
        from app.services.encryption_service import decrypt_file

        db = FakeDb([])
        plaintext = b"existing TrustShare regression payload"
        key = __import__("cryptography.fernet", fromlist=["Fernet"]).Fernet.generate_key().decode()
        with patch.dict("os.environ", {"FILE_KEY_ENCRYPTION_KEY": key, "FILE_STORAGE_BACKEND": "local"}), patch.object(routes_files, "record_activity"):
            metadata = upload_file(
                file=UploadFile(file=io.BytesIO(plaintext), filename="file.txt"),
                password=None, current_user=self.user_a, folder_id=None,
                folder_password=None, db=db,
            )
            record = db.records[0]
            encrypted_bytes = (self.upload_dir / record.stored_name).read_bytes()
            self.assertEqual(metadata["is_encrypted_at_rest"], True)
            self.assertEqual(record.encryption_version, 1)
            self.assertNotEqual(encrypted_bytes, plaintext)
            self.assertEqual(decrypt_file(encrypted_bytes, record.wrapped_data_key, record.encryption_key_id), plaintext)
            response = routes_files.file_download_response(record, self.user_a.id)
            self.assertEqual(response.body, plaintext)


class FileSharingTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.upload_dir = Path(self.temp_dir.name)
        self.original_upload_dir = routes_files.UPLOAD_DIR
        routes_files.UPLOAD_DIR = self.upload_dir
        self.original_send_gmail = routes_files.send_gmail_message
        self.sent_emails = []
        self.fail_email = False
        routes_files.send_gmail_message = self.fake_send_gmail
        self.owner = SimpleNamespace(id=10, email="owner@example.com", full_name="Owner", role="user")
        self.recipient = SimpleNamespace(id=20, email="recipient@example.com", full_name="Recipient", role="user")
        self.file = SimpleNamespace(
            id=7, owner_id=10, folder_id=None, original_name="shared.txt",
            stored_name="shared.upload", content_type="text/plain", size_bytes=6,
            created_at=None, password_hash=None,
        )
        (self.upload_dir / self.file.stored_name).write_bytes(b"secret")
        self.db = SharingFakeDb(self.owner, self.recipient, self.file)

    def tearDown(self):
        routes_files.UPLOAD_DIR = self.original_upload_dir
        routes_files.send_gmail_message = self.original_send_gmail
        self.temp_dir.cleanup()

    def fake_send_gmail(self, db, user_id, recipient, subject, body):
        self.sent_emails.append((recipient, subject, body))
        if self.fail_email:
            raise HTTPException(status_code=503, detail="Gmail API unavailable.")

    def test_supported_preview_categories_are_extension_allowlisted(self):
        supported = {
            "report.pdf": "application/pdf",
            "document.docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            "photo.png": "image/png",
            "photo.jpeg": "image/jpeg",
            "photo.gif": "image/gif",
            "photo.webp": "image/webp",
            "slides.pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
            "legacy-slides.ppt": "application/vnd.ms-powerpoint",
        }

        for filename, content_type in supported.items():
            metadata = routes_files.file_metadata(SimpleNamespace(
                id=8,
                original_name=filename,
                content_type="application/octet-stream",
                size_bytes=100,
                created_at=None,
                folder_id=None,
                password_hash=None,
                encryption_version=1,
            ))
            self.assertTrue(metadata["is_previewable"], filename)
            self.assertEqual(routes_files.get_preview_content_type(
                SimpleNamespace(original_name=filename),
            ), content_type)

        for filename in ("notes.txt", "page.html", "image.svg", "archive.zip", "slides.odp", "clip.mp4", "clip.webm", "sheet.xlsx", "data.csv"):
            metadata = routes_files.file_metadata(SimpleNamespace(
                id=9,
                original_name=filename,
                content_type="application/octet-stream",
                size_bytes=100,
                created_at=None,
                folder_id=None,
                password_hash=None,
                encryption_version=1,
            ))
            self.assertFalse(metadata["is_previewable"], filename)
    def test_folder_owner_must_unlock_protected_folder_before_listing(self):
        folder = SimpleNamespace(
            id=11,
            owner_id=self.owner.id,
            name="Existing protected folder",
            password_hash=hash_folder_password("original folder password"),
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]

        with self.assertRaises(HTTPException) as missing_unlock:
            list_files(folder_id=folder.id, current_user=self.owner, db=self.db)
        self.assertEqual(missing_unlock.exception.status_code, 403)

        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

        original_redis = routes_folders.redis_client
        routes_folders.redis_client = FakeRedis()
        original_folder_id = folder.id
        original_owner_id = folder.owner_id
        original_password_hash = folder.password_hash
        try:
            with self.assertRaises(HTTPException) as incorrect_password:
                routes_folders.unlock_folder(
                    folder.id,
                    FolderUnlockRequest(password="incorrect password"),
                    current_user=self.owner,
                    db=self.db,
                )
            self.assertEqual(incorrect_password.exception.status_code, 403)

            session = routes_folders.unlock_folder(
                folder.id,
                FolderUnlockRequest(password="original folder password"),
                current_user=self.owner,
                db=self.db,
            )
            listed = list_files(
                folder_id=folder.id,
                folder_unlock_token=session["unlock_token"],
                current_user=self.owner,
                db=self.db,
            )
            self.assertEqual([item["id"] for item in listed], [self.file.id])
        finally:
            routes_folders.redis_client = original_redis

        self.assertEqual(folder.id, original_folder_id)
        self.assertEqual(folder.owner_id, original_owner_id)
        self.assertEqual(folder.password_hash, original_password_hash)

    def test_folder_unlock_http_contract_and_folder_scoped_authorization(self):
        from fastapi import FastAPI

        first = SimpleNamespace(
            id=11,
            owner_id=self.owner.id,
            name="Existing folder 11",
            password_hash=hash_folder_password("original password"),
        )
        second = SimpleNamespace(
            id=12,
            owner_id=self.owner.id,
            name="Existing folder 12",
            password_hash=hash_folder_password("another password"),
        )
        self.file.folder_id = first.id
        self.db.folders = [first, second]

        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

        original_redis = routes_folders.redis_client
        redis = FakeRedis()
        routes_folders.redis_client = redis
        active_user = [self.owner]
        app = FastAPI()
        app.include_router(routes_files.router)
        app.include_router(routes_folders.router)
        app.dependency_overrides[auth.get_current_user] = lambda: active_user[0]
        app.dependency_overrides[auth.get_db] = lambda: self.db

        try:
            with TestClient(app) as client:
                self.assertEqual(client.get("/files", params={"folder_id": 11}).status_code, 403)
                self.assertEqual(
                    client.post("/folders/11/unlock", json={"password": "incorrect"}).status_code,
                    403,
                )
                unlocked = client.post(
                    "/folders/11/unlock", json={"password": "original password"}
                )
                self.assertEqual(unlocked.status_code, 200)
                token = unlocked.json()["unlock_token"]
                self.assertGreater(unlocked.json()["expires_in"], 0)

                content = client.get(
                    "/files",
                    params={"folder_id": 11},
                    headers={"X-Folder-Unlock-Token": token},
                )
                self.assertEqual(content.status_code, 200)
                self.assertEqual([row["id"] for row in content.json()], [self.file.id])

                wrong_folder = client.get(
                    "/files",
                    params={"folder_id": 12},
                    headers={"X-Folder-Unlock-Token": token},
                )
                self.assertEqual(wrong_folder.status_code, 403)

                active_user[0] = SimpleNamespace(
                    id=99, email="stranger@example.com", role="user"
                )
                stranger = client.get(
                    "/files",
                    params={"folder_id": 11},
                    headers={"X-Folder-Unlock-Token": token},
                )
                self.assertEqual(stranger.status_code, 404)
        finally:
            routes_folders.redis_client = original_redis

    @patch("app.routes_files.create_notification")
    def test_share_is_persisted_and_listed_only_for_recipient(self, notification_mock):
        created = share_file(
            file_id=7, data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner, db=self.db,
        )
        self.assertTrue(self.db.committed)
        self.assertEqual(created["recipient_email"], self.recipient.email)
        self.assertTrue(created["email_sent"])
        self.assertEqual(created["email_status"], "sent")
        self.assertEqual(created["email_attempt_count"], 1)
        self.assertEqual(self.sent_emails[0][0], self.recipient.email)
        self.assertIn("shared.txt", self.sent_emails[0][2])
        self.assertIn("owner@example.com", self.sent_emails[0][2])
        self.assertIn(f"/shared/{self.db.shares[0].share_token}", self.sent_emails[0][2])
        self.assertIn("Permission: download", self.sent_emails[0][2])
        self.assertIn("no expiration date", self.sent_emails[0][2])
        notification_mock.assert_called_once()
        self.assertEqual(notification_mock.call_args.args[0], self.recipient.id)
        self.assertEqual(notification_mock.call_args.args[3], "file_shared")
        shared_items = list_shared_files(current_user=self.recipient, db=self.db)
        self.assertEqual(len(shared_items), 1)
        self.assertEqual(shared_items[0]["share_id"], self.db.shares[0].id)
        self.assertEqual(shared_items[0]["share_token"], self.db.shares[0].share_token)
        self.assertEqual(shared_items[0]["permission"], "download")
        self.assertEqual(shared_items[0]["owner_name"], self.owner.full_name)
        self.assertEqual(list_shared_files(current_user=self.owner, db=self.db), [])
        self.assertEqual(get_shared_file_info(self.db.shares[0].share_token, current_user=self.recipient, db=self.db)["id"], 7)
        with self.assertRaises(HTTPException):
            get_shared_file_info(self.db.shares[0].share_token, current_user=self.owner, db=self.db)
        downloaded = download_shared_file(share_token=self.db.shares[0].share_token, current_user=self.recipient, db=self.db)
        self.assertEqual(Path(downloaded.path).read_bytes(), b"secret")

    def test_deleted_file_invalidates_existing_share_link(self):
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                permission="download",
            ),
            current_user=self.owner,
            db=self.db,
        )

        old_token = self.db.shares[0].share_token

        with patch.object(routes_files, "record_activity"):
            routes_files.delete_file(
                file_id=7,
                password=None,
                folder_password=None,
                current_user=self.owner,
                db=self.db,
            )

        self.assertEqual(self.db.files, [])
        self.assertEqual(len(self.db.shares), 1)
        self.assertEqual(
            list_shared_files(current_user=self.recipient, db=self.db),
            [],
        )

        with self.assertRaises(HTTPException) as info_error:
            get_shared_file_info(
                old_token,
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(info_error.exception.status_code, 404)

        with self.assertRaises(HTTPException) as download_error:
            download_shared_file(
                share_token=old_token,
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(download_error.exception.status_code, 404)
    def test_unauthorized_recipient_cannot_download_and_revocation_blocks_download(self):
        share_file(
            file_id=7, data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner, db=self.db,
        )
        stranger = SimpleNamespace(id=30, email="stranger@example.com", role="user")
        with patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                download_shared_file(share_token="guessable-id", current_user=stranger, db=self.db)
        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(activity_mock.call_args.args[0], "unauthorized_access")
        self.assertNotIn(
            "file_download_failed",
            [call.args[0] for call in activity_mock.call_args_list],
        )

    def test_wrong_file_password_records_failed_download(self):
        self.file.password_hash = hash_folder_password("correct password")
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                permission="download",
            ),
            current_user=self.owner,
            db=self.db,
        )

        with patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as context:
                download_shared_file_with_password(
                    self.db.shares[0].share_token,
                    FileDownloadRequest(password="wrong password"),
                    current_user=self.recipient,
                    db=self.db,
                )

        self.assertEqual(context.exception.status_code, 403)
        self.assertEqual(activity_mock.call_args.args[0], "file_download_failed")
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: file_password_validation.",
        )
        self.assertNotIn("wrong password", str(activity_mock.call_args))

    def test_revoked_share_is_rejected_by_listing_preview_and_download(self):
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                permission="download",
            ),
            current_user=self.owner,
            db=self.db,
        )

        share = self.db.shares[0]
        token = share.share_token

        revoke_file_share(
            file_id=7,
            share_id=share.id,
            current_user=self.owner,
            db=self.db,
        )

        self.assertEqual(
            list_shared_files(current_user=self.recipient, db=self.db),
            [],
        )

        with self.assertRaises(HTTPException) as info_denied:
            get_shared_file_info(
                token,
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(info_denied.exception.status_code, 404)

        with self.assertRaises(HTTPException) as preview_denied:
            routes_files.preview_shared_file(
                share_token=token,
                data=FileDownloadRequest(),
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(preview_denied.exception.status_code, 404)

        with self.assertRaises(HTTPException) as get_denied:
            download_shared_file(
                share_token=token,
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(get_denied.exception.status_code, 404)

        with self.assertRaises(HTTPException) as post_denied:
            download_shared_file_with_password(
                share_token=token,
                data=FileDownloadRequest(),
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(post_denied.exception.status_code, 404)
    def test_view_only_share_cannot_use_either_download_endpoint(self):
        self.file.original_name = "shared.pdf"
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                permission="view",
            ),
            current_user=self.owner,
            db=self.db,
        )

        token = self.db.shares[0].share_token

        # GET download must reject a view-only share.
        with self.assertRaises(HTTPException) as get_denied:
            download_shared_file(
                share_token=token,
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(get_denied.exception.status_code, 404)

        # POST download must reject a view-only share.
        with self.assertRaises(HTTPException) as post_denied:
            download_shared_file_with_password(
                share_token=token,
                data=FileDownloadRequest(),
                current_user=self.recipient,
                db=self.db,
            )
        self.assertEqual(post_denied.exception.status_code, 404)

        preview = routes_files.preview_shared_file(
            share_token=token,
            data=FileDownloadRequest(),
            current_user=self.recipient,
            db=self.db,
        )
        self.assertEqual(preview.body, b"secret")
    def test_expired_file_share_is_not_listed_or_opened(self):
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            ),
            current_user=self.owner,
            db=self.db,
        )
        share = self.db.shares[0]
        share.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        self.assertEqual(list_shared_files(current_user=self.recipient, db=self.db), [])
        with self.assertRaises(HTTPException) as context:
            get_shared_file_info(share.share_token, current_user=self.recipient, db=self.db)
        self.assertEqual(context.exception.status_code, 404)

        revoke_file_share(file_id=7, share_id=50, current_user=self.owner, db=self.db)
        with self.assertRaises(HTTPException):
            download_shared_file(share_token=self.db.shares[0].share_token, current_user=self.recipient, db=self.db)

    def test_expired_share_returns_exact_404_message_from_all_endpoints(self):
        share_file(
            file_id=7,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                permission="download",
                expires_at=datetime.now(timezone.utc) + timedelta(hours=1),
            ),
            current_user=self.owner,
            db=self.db,
        )

        share = self.db.shares[0]
        share.expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
        token = share.share_token
        expected_message = "This sharing link has expired"

        endpoints = [
            lambda: get_shared_file_info(
                token,
                current_user=self.recipient,
                db=self.db,
            ),
            lambda: routes_files.preview_shared_file(
                share_token=token,
                data=FileDownloadRequest(),
                current_user=self.recipient,
                db=self.db,
            ),
            lambda: download_shared_file(
                share_token=token,
                current_user=self.recipient,
                db=self.db,
            ),
            lambda: download_shared_file_with_password(
                share_token=token,
                data=FileDownloadRequest(),
                current_user=self.recipient,
                db=self.db,
            ),
        ]

        for endpoint in endpoints:
            with self.subTest(endpoint=endpoint):
                with self.assertRaises(HTTPException) as context:
                    endpoint()

                self.assertEqual(context.exception.status_code, 404)
                self.assertEqual(context.exception.detail, expected_message)

    def test_protected_folder_password_is_checked_before_share_creation(self):
        folder = SimpleNamespace(
            id=77, owner_id=self.owner.id,
            password_hash=hash_folder_password("correct horse"),
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]
        with self.assertRaises(HTTPException):
            share_file(
                file_id=7, data=FileShareRequest(recipient_email=self.recipient.email, permission="download", folder_password="wrong"),
                current_user=self.owner, db=self.db,
            )
        self.assertEqual(self.db.shares, [])
        share_file(
            file_id=7, data=FileShareRequest(recipient_email=self.recipient.email, permission="download", folder_password="correct horse"),
            current_user=self.owner, db=self.db,
        )
        self.assertEqual(len(self.db.shares), 1)

    def test_protected_download_requires_backend_verified_post_body(self):
        folder = SimpleNamespace(
            id=77, owner_id=self.owner.id,
            password_hash=hash_folder_password("correct horse"),
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]
        with self.assertRaises(HTTPException) as missing:
            download_file(file_id=7, current_user=self.owner, db=self.db)
        self.assertEqual(missing.exception.status_code, 403)
        with patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as incorrect:
                download_file_with_passwords(
                    file_id=7,
                    data=FileDownloadRequest(folder_password="wrong"),
                    current_user=self.owner,
                    db=self.db,
                )

        self.assertEqual(incorrect.exception.status_code, 403)
        activity_mock.assert_called_once()
        self.assertEqual(
            activity_mock.call_args.args[0],
            "file_download_failed",
        )
        self.assertEqual(
            activity_mock.call_args.kwargs["details"],
            "File download failed: folder_password_validation.",
        )
        self.assertNotIn(
            "wrong",
            str(activity_mock.call_args),
        )
        response = download_file_with_passwords(
            file_id=7,
            data=FileDownloadRequest(folder_password="correct horse"),
            current_user=self.owner,
            db=self.db,
        )
        self.assertEqual(Path(response.path).read_bytes(), b"secret")

    def test_owner_and_grantee_can_list_unprotected_folder_but_stranger_cannot(self):
        folder = SimpleNamespace(
            id=77,
            owner_id=self.owner.id,
            name="Open folder",
            password_hash=None,
        )
        permission = SimpleNamespace(
            id=88,
            folder_id=folder.id,
            owner_id=self.owner.id,
            recipient_email=self.recipient.email,
            permission="viewer",
            revoked=False,
            expires_at=None,
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]
        self.db.folder_shares = [permission]

        self.assertEqual(
            [entry["id"] for entry in list_files(
                folder_id=folder.id, current_user=self.owner, db=self.db
            )],
            [self.file.id],
        )
        self.assertEqual(
            [entry["id"] for entry in list_files(
                folder_id=folder.id, current_user=self.recipient, db=self.db
            )],
            [self.file.id],
        )
        stranger = SimpleNamespace(id=30, email="stranger@example.com", role="user")
        with self.assertRaises(HTTPException) as denied:
            list_files(folder_id=folder.id, current_user=stranger, db=self.db)
        self.assertEqual(denied.exception.status_code, 404)

    def test_folder_viewer_can_list_download_and_revocation_blocks_content(self):
        folder = SimpleNamespace(
            id=77, owner_id=self.owner.id, name="Protected", password_hash=hash_folder_password("folder owner secret"),
        )
        permission = SimpleNamespace(
            id=88, folder_id=folder.id, owner_id=self.owner.id,
            recipient_email=self.recipient.email, permission="viewer",
            revoked=False, expires_at=None,
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]
        self.db.folder_shares = [permission]

        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

            def delete(self, key):
                self.values.pop(key, None)

        original_redis = routes_folders.redis_client
        routes_folders.redis_client = FakeRedis()
        try:
            session = routes_folders.unlock_folder(
                folder.id,
                FolderUnlockRequest(password="folder owner secret"),
                current_user=self.recipient,
                db=self.db,
            )
            unlock_token = session["unlock_token"]

            with self.assertRaises(HTTPException) as missing_password:
                list_files(folder_id=folder.id, current_user=self.recipient, db=self.db)
            self.assertEqual(missing_password.exception.status_code, 403)
            with self.assertRaises(HTTPException):
                list_files(
                    folder_id=folder.id,
                    folder_password="wrong password",
                    current_user=self.recipient,
                    db=self.db,
                )
            visible = list_files(
                folder_id=folder.id,
                current_user=self.recipient,
                folder_unlock_token=unlock_token,
                db=self.db,
            )
            self.assertEqual([entry["id"] for entry in visible], [self.file.id])
            self.assertTrue(visible[0]["is_shared"])
            self.assertTrue(visible[0]["is_parent_folder_password_protected"])
            with self.assertRaises(HTTPException):
                download_file(file_id=self.file.id, current_user=self.recipient, db=self.db)
            response = download_file_with_passwords(
                file_id=self.file.id,
                data=FileDownloadRequest(folder_unlock_token=unlock_token),
                current_user=self.recipient,
                db=self.db,
            )
            self.assertEqual(Path(response.path).read_bytes(), b"secret")

            routes_folders.redis_client.delete(
                routes_folders._folder_unlock_key(unlock_token)
            )
            with self.assertRaises(HTTPException) as expired:
                list_files(
                    folder_id=folder.id,
                    current_user=self.recipient,
                    folder_unlock_token=unlock_token,
                    db=self.db,
                )
            self.assertEqual(expired.exception.status_code, 403)
        finally:
            routes_folders.redis_client = original_redis

        guessed_file = SimpleNamespace(
            id=8, owner_id=30, folder_id=78, original_name="private.txt",
            stored_name="other.upload", content_type="text/plain", size_bytes=1,
            created_at=None, password_hash=None,
        )
        self.db.files.append(guessed_file)
        with self.assertRaises(HTTPException) as guessed:
            download_file(file_id=guessed_file.id, current_user=self.recipient, db=self.db)
        self.assertEqual(guessed.exception.status_code, 404)

        with self.assertRaises(HTTPException):
            delete_file(file_id=self.file.id, current_user=self.recipient, db=self.db)
        permission.revoked = True
        with self.assertRaises(HTTPException) as denied:
            download_file(file_id=self.file.id, current_user=self.recipient, db=self.db)
        self.assertEqual(denied.exception.status_code, 404)
        with self.assertRaises(HTTPException) as list_denied:
            list_files(folder_id=folder.id, current_user=self.recipient, db=self.db)
        self.assertEqual(list_denied.exception.status_code, 404)

    def test_direct_file_share_still_requires_protected_parent_password(self):
        self.file.original_name = "shared.pdf"
        folder = SimpleNamespace(
            id=77,
            owner_id=self.owner.id,
            name="Protected",
            password_hash=hash_folder_password("folder owner secret"),
        )
        self.file.folder_id = folder.id
        self.db.folders = [folder]
        created = share_file(
            file_id=self.file.id,
            data=FileShareRequest(
                recipient_email=self.recipient.email,
                folder_password="folder owner secret",
            ),
            current_user=self.owner,
            db=self.db,
        )
        shared_info = get_shared_file_info(
            self.db.shares[0].share_token, current_user=self.recipient, db=self.db
        )
        self.assertTrue(shared_info["is_parent_folder_password_protected"])
        class FakeRedis:
            def __init__(self):
                self.values = {}

            def setex(self, key, _ttl, value):
                self.values[key] = value

            def get(self, key):
                return self.values.get(key)

        original_redis = routes_folders.redis_client
        routes_folders.redis_client = FakeRedis()
        try:
            session = routes_folders.unlock_folder(
                folder.id,
                FolderUnlockRequest(password="folder owner secret"),
                current_user=self.recipient,
                db=self.db,
            )
            with self.assertRaises(HTTPException) as preview_denied:
                routes_files.preview_shared_file(
                    self.db.shares[0].share_token,
                    FileDownloadRequest(),
                    current_user=self.recipient,
                    db=self.db,
                )
            self.assertEqual(preview_denied.exception.status_code, 403)
            preview = routes_files.preview_shared_file(
                self.db.shares[0].share_token,
                FileDownloadRequest(folder_unlock_token=session["unlock_token"]),
                current_user=self.recipient,
                db=self.db,
            )
            self.assertEqual(preview.body, b"secret")
            with self.assertRaises(HTTPException):
                download_shared_file(
                    self.db.shares[0].share_token, current_user=self.recipient, db=self.db
                )
            with self.assertRaises(HTTPException):
                download_shared_file_with_password(
                    self.db.shares[0].share_token,
                    FileDownloadRequest(folder_password="wrong password"),
                    current_user=self.recipient,
                    db=self.db,
                )
            response = download_shared_file_with_password(
                self.db.shares[0].share_token,
                FileDownloadRequest(folder_unlock_token=session["unlock_token"]),
                current_user=self.recipient,
                db=self.db,
            )
        finally:
            routes_folders.redis_client = original_redis
        self.assertEqual(Path(response.path).read_bytes(), b"secret")

    def test_email_failure_keeps_share_and_retry_does_not_duplicate_it(self):
        self.fail_email = True
        expires_at = datetime.now(timezone.utc) + timedelta(days=2)
        first = share_file(
            file_id=7,
            data=FileShareRequest(recipient_email=self.recipient.email, permission="view", expires_at=expires_at),
            current_user=self.owner,
            db=self.db,
        )
        self.assertFalse(first["email_sent"])
        self.assertEqual(first["email_status"], "failed")
        self.assertEqual(self.db.shares[0].email_error_category, "provider_error")
        self.assertEqual(len(self.db.shares), 1)

        self.fail_email = False
        with patch.object(routes_files, "record_activity"):
            retry = retry_share_invitation(
            file_id=7,
            share_id=first["id"],
            data=FileDownloadRequest(),
            current_user=self.owner,
            db=self.db,
        )
        self.assertEqual(retry["email_status"], "sent")
        self.assertEqual(retry["email_attempt_count"], 2)
        self.assertEqual(retry["id"], first["id"])
        self.assertEqual(len(self.db.shares), 1)
        self.assertEqual(len(self.sent_emails), 2)
        self.assertIn("Permission: view.", self.sent_emails[-1][2])
        self.assertIn("expires", self.sent_emails[-1][2].lower())

    def test_ambiguous_invitation_is_not_retryable_or_resent_by_repeated_grant(self):
        routes_files.send_gmail_message = lambda *_args, **_kwargs: (_ for _ in ()).throw(
            GmailDeliveryUncertain()
        )
        result = share_file(
            file_id=7,
            data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner,
            db=self.db,
        )
        share = self.db.shares[0]
        self.assertEqual(result["email_status"], "uncertain")
        self.assertEqual(share.email_error_category, "ambiguous_delivery")

        with self.assertRaises(HTTPException) as retry_error:
            retry_share_invitation(
                file_id=7,
                share_id=share.id,
                data=FileDownloadRequest(),
                current_user=self.owner,
                db=self.db,
            )
        self.assertEqual(retry_error.exception.status_code, 409)

        repeated = share_file(
            file_id=7,
            data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner,
            db=self.db,
        )
        self.assertEqual(repeated["email_status"], "uncertain")
        self.assertEqual(len(self.sent_emails), 0)
        self.assertEqual(len(self.db.shares), 1)

    def test_repeating_an_unchanged_successful_grant_does_not_resend(self):
        created = share_file(
            file_id=7,
            data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner,
            db=self.db,
        )
        repeated = share_file(
            file_id=7,
            data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
            current_user=self.owner,
            db=self.db,
        )
        self.assertEqual(created["email_status"], "sent")
        self.assertEqual(repeated["email_status"], "sent")
        self.assertEqual(len(self.sent_emails), 1)

    def test_unique_share_race_reuses_competing_delivery_state_without_sending(self):
        original_commit = self.db.commit
        race_pending = True

        def commit_with_competing_share():
            nonlocal race_pending
            if race_pending:
                race_pending = False
                self.db.shares.clear()
                self.db.shares.append(FileShare(
                    id=88,
                    share_token="concurrent-share-token",
                    file_id=self.file.id,
                    owner_id=self.owner.id,
                    recipient_email=self.recipient.email,
                    permission="download",
                    revoked=False,
                    email_status="sending",
                    email_attempt_count=1,
                ))
                raise IntegrityError("simulated unique share conflict", {}, Exception())
            original_commit()

        self.db.commit = commit_with_competing_share
        with patch.object(routes_files, "record_activity"), patch.object(
            routes_files, "create_notification"
        ):
            result = share_file(
                file_id=7,
                data=FileShareRequest(recipient_email=self.recipient.email, permission="download"),
                current_user=self.owner,
                db=self.db,
            )
        self.assertEqual(result["id"], 88)
        self.assertEqual(result["email_status"], "sending")
        self.assertEqual(len(self.db.shares), 1)
        self.assertEqual(self.sent_emails, [])

    def test_invalid_persisted_folder_permission_does_not_grant_file_access(self):
        self.file.folder_id = 77
        self.db.folder_shares = [SimpleNamespace(
            folder_id=77,
            owner_id=self.owner.id,
            recipient_email=self.recipient.email,
            permission="admin",
            revoked=False,
            expires_at=None,
        )]

        with patch.object(routes_files, "record_activity") as activity_mock:
            with self.assertRaises(HTTPException) as denied:
                routes_files.get_readable_file(
                    self.file.id,
                    self.recipient,
                    self.db,
                )

        self.assertEqual(denied.exception.status_code, 404)
        self.assertEqual(activity_mock.call_args.args[0], "unauthorized_access")


class ProtectedFileEndpointTests(unittest.TestCase):
    @classmethod
    def tearDownClass(cls):
        database.mongo_client.close()
        database.mysql_engine.dispose()
        super().tearDownClass()

    def test_unauthenticated_list_request_is_rejected(self):
        app = FastAPI()
        app.include_router(routes_files.router)

        with TestClient(app) as client:
            response = client.get("/files")

        self.assertEqual(response.status_code, 401)
        self.assertEqual(response.json()["detail"], "Please sign in to continue.")


if __name__ == "__main__":
    unittest.main()
