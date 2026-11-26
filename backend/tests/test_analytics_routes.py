import unittest
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

import app.auth as auth
import app.routes_monitoring as monitoring
from app.database import Base
from app.models import FileShare, Folder, FolderShare, StoredFile, User


class ActivityCollection:
    def __init__(self, rows=()):
        self.rows = list(rows)

    @staticmethod
    def _matches(row, query):
        for key, wanted in query.items():
            actual = row.get(key)
            if isinstance(wanted, dict):
                if "$in" in wanted and actual not in wanted["$in"]:
                    return False
                if "$gte" in wanted and (actual is None or actual < wanted["$gte"]):
                    return False
                if "$lt" in wanted and (actual is None or actual >= wanted["$lt"]):
                    return False
            elif actual != wanted:
                return False
        return True

    def count_documents(self, query):
        return sum(self._matches(row, query) for row in self.rows)

    def aggregate(self, pipeline):
        selected = self.rows
        for stage in pipeline:
            if "$match" in stage:
                selected = [row for row in selected if self._matches(row, stage["$match"])]
            elif "$group" in stage:
                groups = {}
                for row in selected:
                    key = row.get("file_id")
                    groups[key] = groups.get(key, 0) + 1
                selected = [{"_id": key, "downloads": count} for key, count in groups.items()]
            elif "$sort" in stage:
                selected.sort(key=lambda row: row.get("downloads", 0), reverse=True)
            elif "$limit" in stage:
                selected = selected[:stage["$limit"]]
        return selected


class AnalyticsRouteTests(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(engine)
        self.session = sessionmaker(bind=engine)()
        self.owner = User(full_name="Owner", email="owner@example.test", role="admin")
        self.other = User(full_name="Other", email="other@example.test", role="user")
        self.session.add_all([self.owner, self.other])
        self.session.commit()
        self.file_pdf = StoredFile(original_name="a.pdf", stored_name="a", content_type="application/pdf", size_bytes=100, owner_id=self.owner.id, created_at=datetime(2026, 11, 8))
        self.file_txt = StoredFile(original_name="b.txt", stored_name="b", content_type="text/plain", size_bytes=50, owner_id=self.owner.id, created_at=datetime(2026, 11, 9))
        self.other_pdf = StoredFile(original_name="c.pdf", stored_name="c", content_type="application/pdf", size_bytes=200, owner_id=self.other.id, created_at=datetime(2026, 11, 9))
        self.session.add_all([self.file_pdf, self.file_txt, self.other_pdf])
        self.session.commit()
        folder = Folder(name="Workspace", owner_id=self.owner.id)
        self.session.add(folder)
        self.session.commit()
        self.session.add_all([
            FileShare(share_token="share-a", file_id=self.file_pdf.id, owner_id=self.owner.id, recipient_email="recipient@example.test", permission="download", revoked=False, created_at=datetime(2026, 11, 8)),
            FolderShare(folder_id=folder.id, owner_id=self.owner.id, recipient_email="folder@example.test", permission="viewer", revoked=False, expires_at=datetime(2026, 11, 9), created_at=datetime(2026, 11, 8)),
        ])
        self.session.commit()
        self.activity = ActivityCollection([
            {"event_type": "file_download_success", "user_id": self.owner.id, "file_id": self.file_pdf.id, "created_at": datetime(2026, 11, 8, 12, tzinfo=timezone.utc)},
            {"event_type": "file_download_success", "user_id": self.owner.id, "file_id": self.file_pdf.id, "created_at": datetime(2026, 11, 9, 12, tzinfo=timezone.utc)},
            {"event_type": "file_download_success", "user_id": self.other.id, "file_id": 999, "created_at": datetime(2026, 11, 9, 12, tzinfo=timezone.utc)},
            {"event_type": "file_download_failed", "user_id": self.owner.id, "file_id": self.file_txt.id, "created_at": datetime(2026, 11, 9, 12, tzinfo=timezone.utc)},
        ])
        self.app = FastAPI()
        self.app.include_router(monitoring.router)
        self.app.dependency_overrides[auth.get_db] = lambda: self.session
        self.app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(id=self.owner.id, role="admin")

    def tearDown(self):
        self.session.close()

    def test_storage_file_type_download_and_sharing_reports_use_filtered_records(self):
        with patch.object(monitoring, "mongo_db", {monitoring.ACTIVITY_COLLECTION: self.activity}):
            with TestClient(self.app) as client:
                params = {"user_id": self.owner.id, "start_date": "2026-11-08", "end_date": "2026-11-08"}
                storage = client.get("/analytics/storage", params=params).json()
                user_storage = client.get("/analytics/users/storage", params=params).json()
                file_types = client.get("/analytics/files", params=params).json()
                downloads = client.get("/analytics/downloads", params={**params, "file_type": "application/pdf"}).json()
                sharing = client.get("/analytics/sharing", params=params).json()
                expired_sharing = client.get("/analytics/sharing", params={**params, "status": "expired"}).json()
        self.assertEqual((storage["total_files"], storage["total_storage_bytes"]), (1, 100))
        self.assertEqual(storage["user_storage"][0]["storage_bytes"], 100)
        self.assertEqual(user_storage["user_storage"][0]["storage_bytes"], 100)
        self.assertEqual(storage["total_downloads"], 1)
        self.assertEqual(storage["top_downloaded_files"][0]["file_name"], "a.pdf")
        self.assertEqual(file_types["files"], [{"content_type": "application/pdf", "count": 1, "size_bytes": 100}])
        self.assertEqual(downloads["total_downloads"], 1)
        self.assertEqual(downloads["failed_downloads"], 0)
        self.assertEqual(downloads["files"][0]["file_name"], "a.pdf")
        self.assertEqual(sharing["total_shared_files"], 1)
        self.assertEqual(sharing["total_links"], 2)
        self.assertEqual(sharing["active_links"], 1)
        self.assertEqual(sharing["expired_links"], 1)
        self.assertEqual(expired_sharing["total_links"], 1)
        self.assertEqual(expired_sharing["total_shared_files"], 0)

    def test_missing_historical_file_id_still_counts_and_empty_results_are_safe(self):
        with patch.object(monitoring, "mongo_db", {monitoring.ACTIVITY_COLLECTION: self.activity}):
            with TestClient(self.app) as client:
                result = client.get("/analytics/downloads", params={"start_date": "2026-11-10"}).json()
                missing_ids = client.get("/analytics/downloads", params={"start_date": "2026-11-09", "end_date": "2026-11-09"}).json()
                empty = client.get("/analytics/storage", params={"user_id": 999}).json()
                invalid_range = client.get("/analytics/storage", params={"start_date": "2026-11-10", "end_date": "2026-11-09"})
        self.assertEqual(result["total_downloads"], 0)
        self.assertEqual(result["files"], [])
        self.assertEqual(missing_ids["total_downloads"], 2)
        self.assertEqual(missing_ids["failed_downloads"], 1)
        self.assertTrue(all(row["file_id"] is not None for row in missing_ids["files"]))
        unavailable = next(row for row in missing_ids["files"] if row["file_id"] not in {self.file_pdf.id, self.file_txt.id})
        self.assertEqual(unavailable["file_name"], f"File record unavailable (ID: {unavailable['file_id']})")
        self.assertEqual(invalid_range.status_code, 422)
        self.assertEqual(empty["total_files"], 0)
        self.assertEqual(empty["total_storage_bytes"], 0)
        self.assertEqual(empty["user_storage"], [])

    def test_analytics_endpoints_require_admin_role(self):
        self.app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(id=99, role="user")
        with TestClient(self.app) as client:
            response = client.get("/analytics/storage")
        self.assertEqual(response.status_code, 403)


if __name__ == "__main__":
    unittest.main()
