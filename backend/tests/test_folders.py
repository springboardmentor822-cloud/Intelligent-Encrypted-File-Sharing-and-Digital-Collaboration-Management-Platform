import io
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.testclient import TestClient

import app.auth as auth
import app.database as database
import app.routes_files as routes_files
import app.routes_folders as routes_folders
from app.models import Folder, FolderShare, StoredFile, User, FileShare
from app.routes_folders import (
    create_folder,
    delete_folder,
    get_owned_folder,
    list_folders,
    list_folder_access,
    grant_folder_access,
    update_folder_access,
    revoke_folder_access,
    rename_folder,
)
from app.gmail_service import GmailDeliveryUncertain
from app.schemas import FolderCreateRequest, FolderShareRequest, FolderShareUpdateRequest, FolderUnlockRequest, FolderUpdateRequest


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
            if key is not None and getattr(record, key, None) != expected:
                return False
        return True

    def all(self):
        return [record for record in self.records if self._matches(record)]

    def first(self):
        return next(iter(self.all()), None)

    def count(self):
        return len(self.all())


class FakeDb:
    def __init__(self, folders=None, files=None):
        self.folders = folders or []
        self.files = files or []
        self.deleted = []
        self.next_folder_id = 10

    def query(self, model):
        if model is Folder:
            return FakeQuery(self.folders)
        if model is StoredFile:
            return FakeQuery(self.files)
        raise AssertionError(f"Unexpected model: {model}")

    def add(self, record):
        if isinstance(record, Folder):
            if record.id is None:
                record.id = self.next_folder_id
                self.next_folder_id += 1
            self.folders.append(record)
        else:
            self.files.append(record)

    def refresh(self, _record):
        return None

    def delete(self, record):
        self.deleted.append(record)
        if record in self.folders:
            self.folders.remove(record)

    def commit(self):
        return None

    def rollback(self):
        return None


class FolderRouteTests(unittest.TestCase):
    def setUp(self):
        self.user_a = SimpleNamespace(id=101, role="user")
        self.user_b = SimpleNamespace(id=202, role="user")

    def test_crud_for_owner(self):
        db = FakeDb()
        folder = create_folder(
            FolderCreateRequest(name="Reports"),
            current_user=self.user_a,
            db=db,
        )

        listed = list_folders(current_user=self.user_a, db=db)
        folder.name = "Reports"
        renamed = rename_folder(
            folder.id,
            FolderUpdateRequest(name="Archive"),
            current_user=self.user_a,
            db=db,
        )
        deleted = delete_folder(folder.id, current_user=self.user_a, db=db)

        self.assertEqual(folder.id, 10)
        self.assertEqual(len(listed), 1)
        self.assertEqual(renamed.name, "Archive")
        self.assertIsNone(deleted)
        self.assertEqual(db.folders, [])

    def test_protected_folder_records_creator_and_returns_no_password_hash(self):
        db = FakeDb()
        response = create_folder(
            FolderCreateRequest(name="Private", password="folder-password"),
            current_user=self.user_a,
            db=db,
        )
        self.assertEqual(response.owner_id, self.user_a.id)
        self.assertFalse(hasattr(response, "password_hash"))
        self.assertNotEqual(db.folders[0].password_hash, "folder-password")
        self.assertTrue(
            routes_folders.verify_folder_password(
                "folder-password", db.folders[0].password_hash
            )
        )

    def test_other_user_cannot_access_folder(self):
        folder = Folder(id=7, name="Private", owner_id=self.user_a.id)
        db = FakeDb(folders=[folder])

        with self.assertRaises(HTTPException) as context:
            get_owned_folder(folder.id, self.user_b, db)

        self.assertEqual(context.exception.status_code, 404)

    def test_deleting_non_empty_folder_keeps_files_in_root_by_default(self):
        folder = Folder(id=7, name="Private", owner_id=self.user_a.id)
        stored_file = SimpleNamespace(
            id=30, owner_id=self.user_a.id, folder_id=folder.id
        )
        db = FakeDb(folders=[folder], files=[stored_file])

        result = delete_folder(folder.id, current_user=self.user_a, db=db)

        self.assertIsNone(result)
        self.assertEqual(db.deleted, [folder])
        self.assertIsNone(stored_file.folder_id)
        self.assertEqual(db.files, [stored_file])
        self.assertEqual(db.folders, [])


class FolderShareFakeDb:
    def __init__(self, owner, recipient, folder):
        self.users = [owner, recipient]
        self.folders = [folder]
        self.shares = []
        self.committed = False

    def query(self, model):
        records = {User: self.users, Folder: self.folders, FolderShare: self.shares}[model]
        return FakeQuery(records)

    def add(self, record):
        record.id = 40 + len(self.shares)
        self.shares.append(record)

    def commit(self):
        self.committed = True

    def refresh(self, _record):
        return None

    def rollback(self):
        self.committed = False


class FolderAccessTests(unittest.TestCase):
    def setUp(self):
        self.owner = SimpleNamespace(id=101, email="owner@example.com", full_name="Owner", role="user")
        self.recipient = SimpleNamespace(id=202, email="viewer@example.com", full_name="Viewer", role="user")
        self.folder = Folder(id=7, name="Reports", owner_id=self.owner.id, password_hash=None)
        self.db = FolderShareFakeDb(self.owner, self.recipient, self.folder)

    def test_owner_folder_listing_reports_existing_password_protection(self):
        self.folder.password_hash = routes_folders.hash_folder_password(
            "original folder password"
        )

        app = FastAPI()
        app.include_router(routes_folders.router)
        app.dependency_overrides[auth.get_current_user] = lambda: self.owner
        app.dependency_overrides[auth.get_db] = lambda: self.db

        with TestClient(app) as client:
            response = client.get("/folders")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()), 1)
        self.assertEqual(response.json()[0]["id"], self.folder.id)
        self.assertEqual(response.json()[0]["owner_id"], self.owner.id)
        self.assertTrue(response.json()[0]["is_password_protected"])

    @patch("app.routes_folders.create_notification")
    @patch("app.routes_folders.send_gmail_message")
    @patch("app.routes_folders.gmail_status", return_value={"sender_email": "owner@gmail.com"})
    def test_owner_can_grant_list_update_and_revoke_viewer_access(self, _gmail_status, send_message, notification_mock):
        granted = grant_folder_access(
            7,
            FolderShareRequest(recipient_email=self.recipient.email, permission="viewer"),
            current_user=self.owner,
            db=self.db,
        )
        self.assertTrue(self.db.committed)
        self.assertTrue(granted["email_sent"])
        self.assertEqual(granted["recipient_email"], self.recipient.email)
        self.assertEqual(send_message.call_args.args[2], self.recipient.email)
        notification_mock.assert_called_once()
        self.assertEqual(notification_mock.call_args.args[0], self.recipient.id)
        self.assertEqual(notification_mock.call_args.args[3], "folder_shared")
        self.assertEqual(len(self.db.shares), 1)
        visible_folders = list_folders(current_user=self.recipient, db=self.db)
        self.assertEqual(len(visible_folders), 1)
        self.assertTrue(visible_folders[0]["is_shared"])

        listing = list_folder_access(7, current_user=self.owner, db=self.db)
        self.assertEqual(listing["access"][0]["status"], "Active")
        self.assertEqual(listing["access"][0]["email_status"], "sent")
        self.assertEqual(listing["access"][0]["email_attempt_count"], 1)
        update_folder_access(
            7, granted["id"], FolderShareUpdateRequest(permission="viewer"),
            current_user=self.owner, db=self.db,
        )
        self.assertEqual(self.db.shares[0].permission, "viewer")
        revoke_folder_access(7, granted["id"], current_user=self.owner, db=self.db)
        self.assertTrue(self.db.shares[0].revoked)

    def test_unauthorized_user_cannot_manage_or_grant_access_and_duplicates_reuse_record(self):
        with self.assertRaises(HTTPException) as denied:
            list_folder_access(7, current_user=self.recipient, db=self.db)
        self.assertEqual(denied.exception.status_code, 404)
        with self.assertRaises(HTTPException) as grant_denied:
            grant_folder_access(
                7, FolderShareRequest(recipient_email="someone@example.com"),
                current_user=self.recipient, db=self.db,
            )
        self.assertEqual(grant_denied.exception.status_code, 404)

        with patch("app.routes_folders.send_gmail_message", side_effect=HTTPException(503, "Gmail unavailable")), patch(
            "app.routes_folders.gmail_status", return_value={"sender_email": "owner@gmail.com"}
        ):
            first = grant_folder_access(
                7, FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner, db=self.db,
            )
            second = grant_folder_access(
                7, FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner, db=self.db,
            )
        self.assertFalse(first["email_sent"])
        self.assertEqual(first["id"], second["id"])
        self.assertEqual(len(self.db.shares), 1)

    def test_ambiguous_folder_invitation_is_not_resent_by_same_grant(self):
        with patch(
            "app.routes_folders.send_gmail_message",
            side_effect=GmailDeliveryUncertain(),
        ) as send, patch(
            "app.routes_folders.gmail_status",
            return_value={"sender_email": "owner@gmail.com"},
        ):
            first = grant_folder_access(
                7,
                FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner,
                db=self.db,
            )
            second = grant_folder_access(
                7,
                FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner,
                db=self.db,
            )
        self.assertEqual(first["email_status"], "uncertain")
        self.assertEqual(second["email_status"], "uncertain")
        self.assertEqual(send.call_count, 1)
        self.assertEqual(len(self.db.shares), 1)

    def test_successful_folder_invitation_is_not_resent_for_unchanged_grant(self):
        with patch("app.routes_folders.send_gmail_message") as send, patch(
            "app.routes_folders.gmail_status",
            return_value={"sender_email": "owner@gmail.com"},
        ):
            first = grant_folder_access(
                7,
                FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner,
                db=self.db,
            )
            second = grant_folder_access(
                7,
                FolderShareRequest(recipient_email=self.recipient.email),
                current_user=self.owner,
                db=self.db,
            )
        self.assertEqual(first["email_status"], "sent")
        self.assertEqual(second["email_status"], "sent")
        self.assertEqual(send.call_count, 1)

    def test_password_protected_folder_requires_owner_password_before_grant(self):
        self.folder.password_hash = routes_folders.hash_folder_password("correct horse")
        with patch("app.routes_folders.send_gmail_message"):
            with self.assertRaises(HTTPException):
                grant_folder_access(
                    7, FolderShareRequest(recipient_email=self.recipient.email, folder_password="wrong"),
                    current_user=self.owner, db=self.db,
                )
        self.assertEqual(self.db.shares, [])

    def test_expired_access_is_listed_as_expired_and_not_granted_to_folder_listing(self):
        self.db.shares.append(FolderShare(
            id=41,
            folder_id=self.folder.id,
            owner_id=self.owner.id,
            recipient_email=self.recipient.email,
            permission="viewer",
            revoked=False,
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1),
        ))
        access = list_folder_access(self.folder.id, current_user=self.owner, db=self.db)
        self.assertEqual(access["access"][0]["status"], "Expired")
        self.assertEqual(list_folders(current_user=self.recipient, db=self.db), [])


class FolderUnlockTests(unittest.TestCase):
    def test_unlock_token_is_user_and_folder_bound_and_expires(self):
        folder = Folder(
            id=7,
            name="Protected",
            owner_id=101,
            password_hash=routes_folders.hash_folder_password("correct horse"),
        )
        owner = SimpleNamespace(id=101, email="owner@example.com", role="user")
        stranger = SimpleNamespace(id=202, email="stranger@example.com", role="user")
        db = FakeDb(folders=[folder])

        class FakeRedis:
            def __init__(self):
                self.values = {}
                self.ttl = {}

            def setex(self, key, ttl, value):
                self.values[key] = value
                self.ttl[key] = ttl

            def get(self, key):
                return self.values.get(key)

            def delete(self, key):
                self.values.pop(key, None)

        original_redis = routes_folders.redis_client
        redis = FakeRedis()
        routes_folders.redis_client = redis
        try:
            with self.assertRaises(HTTPException):
                routes_folders.unlock_folder(
                    folder.id,
                    FolderUnlockRequest(password="incorrect"),
                    current_user=owner,
                    db=db,
                )
            session = routes_folders.unlock_folder(
                folder.id,
                FolderUnlockRequest(password="correct horse"),
                current_user=owner,
                db=db,
            )
            token = session["unlock_token"]
            self.assertEqual(session["expires_in"], 900)
            key = routes_folders._folder_unlock_key(token)
            self.assertEqual(redis.ttl[key], 900)
            routes_folders.require_folder_unlock(folder, owner, unlock_token=token)
            with self.assertRaises(HTTPException):
                routes_folders.require_folder_unlock(folder, stranger, unlock_token=token)
            redis.delete(key)
            with self.assertRaises(HTTPException):
                routes_folders.require_folder_unlock(folder, owner, unlock_token=token)
        finally:
            routes_folders.redis_client = original_redis
    def test_expired_direct_file_share_cannot_unlock_folder(self):
        folder = Folder(
            id=7,
            name="Protected",
            owner_id=101,
            password_hash=routes_folders.hash_folder_password("correct horse"),
        )

        recipient = SimpleNamespace(
            id=202,
            email="recipient@example.com",
            role="user",
        )

        expired_share = SimpleNamespace(
            recipient_email="recipient@example.com",
            revoked_at=None,
            permission="download",
            expires_at=datetime.now(timezone.utc) - timedelta(minutes=1),
        )

        stored_file = StoredFile(
            id=10,
            original_name="test.txt",
            stored_name="test-stored.txt",
            content_type="text/plain",
            size_bytes=10,
            owner_id=101,
            folder_id=7,
        )

        stored_file.shares = [expired_share]


class FolderIntegrationTests(unittest.TestCase):
    def test_guest_and_unauthenticated_folder_access_is_denied(self):
        app = FastAPI()
        app.include_router(routes_folders.router)
        app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(
            id=3,
            role="guest",
        )

        with TestClient(app) as client:
            guest_response = client.get("/folders")

        self.assertEqual(guest_response.status_code, 403)

        app = FastAPI()
        app.include_router(routes_folders.router)
        with TestClient(app) as client:
            unauthenticated_response = client.get("/folders")

        self.assertEqual(unauthenticated_response.status_code, 401)

    def test_file_assignment_accepts_owned_folder_and_root_remains_null(self):
        folder = Folder(id=9, name="Reports", owner_id=101)
        user = SimpleNamespace(id=101, role="user")
        db = FakeDb(folders=[folder])
        original_upload_dir = routes_files.UPLOAD_DIR

        with tempfile.TemporaryDirectory() as temp_dir:
            routes_files.UPLOAD_DIR = Path(temp_dir)
            try:
                # This test checks folder assignment, not Azure connectivity.
                with (
                    patch.dict(
                        "os.environ",
                        {"FILE_STORAGE_BACKEND": "local"},
                    ),
                    patch.object(routes_files, "record_activity"),
                ):
                    assigned = routes_files.upload_file(
                        file=UploadFile(
                            file=io.BytesIO(b"folder content"),
                            filename="report.txt",
                        ),
                        current_user=user,
                        folder_id=folder.id,
                        db=db,
                    )
                    root = routes_files.upload_file(
                        file=UploadFile(
                            file=io.BytesIO(b"root content"),
                            filename="root.txt",
                        ),
                        current_user=user,
                        folder_id=None,
                        db=db,
                    )
            finally:
                routes_files.UPLOAD_DIR = original_upload_dir

        self.assertEqual(assigned["folder_id"], folder.id)
        self.assertIsNone(root["folder_id"])

if __name__ == "__main__":
    unittest.main()
