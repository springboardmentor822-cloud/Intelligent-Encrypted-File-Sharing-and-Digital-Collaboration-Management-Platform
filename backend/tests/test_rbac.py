import ast
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

from fastapi import FastAPI, HTTPException
from fastapi.testclient import TestClient
from fastapi.security import HTTPAuthorizationCredentials
from jose import jwt

import app.auth as auth
import app.database as database
import app.routes_auth as routes_auth
import app.routes_files as routes_files
from app.models import User
from app.routes_files import download_file


class QueryStub:
    def __init__(self, record):
        self.record = record

    def filter(self, *_conditions):
        return self

    def first(self):
        return self.record


class DbStub:
    def __init__(self, record):
        self.record = record

    def query(self, _model):
        return QueryStub(self.record)


class RoleDependencyTests(unittest.TestCase):
    @staticmethod
    def request():
        return SimpleNamespace(
            method="GET",
            url=SimpleNamespace(path="/test-role-dependency"),
            client=None,
        )

    def test_admin_and_user_are_allowed_for_private_file_role(self):
        admin = SimpleNamespace(id=1, role="admin")
        user = SimpleNamespace(id=2, role="user")
        checker = auth.require_roles("admin", "user")

        self.assertIs(checker(self.request(), admin), admin)
        self.assertIs(checker(self.request(), user), user)

    def test_guest_is_forbidden(self):
        guest = SimpleNamespace(id=3, role="guest")

        with patch.object(auth, "record_activity"):
            with self.assertRaises(HTTPException) as context:
                auth.require_roles("admin", "user")(self.request(), guest)

        self.assertEqual(context.exception.status_code, 403)

    def test_unknown_role_cannot_become_admin(self):
        unknown = SimpleNamespace(id=4, role="superadmin")

        self.assertEqual(auth.effective_role(unknown), auth.ROLE_USER)
        with patch.object(auth, "record_activity"):
            with self.assertRaises(HTTPException) as context:
                auth.require_roles("admin")(self.request(), unknown)

        self.assertEqual(context.exception.status_code, 403)

    def test_missing_role_cannot_become_admin(self):
        missing = SimpleNamespace(id=5, role=None)

        self.assertEqual(auth.effective_role(missing), auth.ROLE_USER)
        with patch.object(auth, "record_activity"):
            with self.assertRaises(HTTPException) as context:
                auth.require_roles("admin")(self.request(), missing)

        self.assertEqual(context.exception.status_code, 403)

    def test_stale_admin_jwt_claim_does_not_promote_database_user(self):
        database_user = SimpleNamespace(
            id=6,
            role="user",
            email="user@example.com",
            hashed_password=auth.hash_password("password"),
        )
        token = jwt.encode(
            {
                "sub": str(database_user.id),
                "role": "admin",
                "password_version": auth._password_version(database_user),
                "exp": datetime.now(timezone.utc) + timedelta(minutes=5),
            },
            auth.JWT_SECRET_KEY,
            algorithm=auth.JWT_ALGORITHM,
        )
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )

        resolved = auth.get_current_user(
            credentials=credentials,
            db=DbStub(database_user),
        )

        self.assertIs(resolved, database_user)
        with patch.object(auth, "record_activity"):
            with self.assertRaises(HTTPException) as context:
                auth.require_roles("admin")(self.request(), resolved)

        self.assertEqual(context.exception.status_code, 403)

    def test_missing_credentials_return_401(self):
        with self.assertRaises(HTTPException) as context:
            auth.get_current_user(credentials=None, db=DbStub(None))

        self.assertEqual(context.exception.status_code, 401)

    def test_password_change_invalidates_existing_token(self):
        database_user = SimpleNamespace(
            id=7,
            role="user",
            email="user@example.com",
            hashed_password=auth.hash_password("old-password"),
        )
        token = auth.create_access_token(database_user)
        credentials = HTTPAuthorizationCredentials(
            scheme="Bearer",
            credentials=token,
        )
        database_user.hashed_password = auth.hash_password("new-password")

        with self.assertRaises(HTTPException) as context:
            auth.get_current_user(credentials=credentials, db=DbStub(database_user))

        self.assertEqual(context.exception.status_code, 401)


class RoleAssignmentTests(unittest.TestCase):
    def test_password_verification_rejects_malformed_hashes(self):
        hashed_password = auth.hash_password("correct-password")

        self.assertTrue(
            auth.verify_password("correct-password", hashed_password)
        )
        self.assertFalse(
            auth.verify_password("correct-password", "not-a-password-hash")
        )

    def test_local_and_oauth_creation_paths_use_user_role_constant(self):
        source = Path(routes_auth.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        role_values = []

        for node in ast.walk(tree):
            if isinstance(node, ast.Call) and isinstance(node.func, ast.Name):
                if node.func.id != "User":
                    continue
                for keyword in node.keywords:
                    if keyword.arg == "role":
                        role_values.append(keyword.value)

        self.assertEqual(len(role_values), 3)
        self.assertTrue(
            all(
                isinstance(value, ast.Name)
                and value.id == "ROLE_USER"
                for value in role_values
            )
        )

    def test_provider_linking_paths_do_not_assign_roles(self):
        source = Path(routes_auth.__file__).read_text(encoding="utf-8")
        tree = ast.parse(source)
        callback_names = {"google_callback", "microsoft_link_callback"}

        for node in tree.body:
            if not isinstance(node, ast.AsyncFunctionDef):
                continue
            if node.name not in callback_names:
                continue

            for child in ast.walk(node):
                if isinstance(child, ast.Assign):
                    self.assertFalse(
                        any(
                            isinstance(target, ast.Attribute)
                            and target.attr == "role"
                            for target in child.targets
                        )
                    )


class RoutePermissionTests(unittest.TestCase):
    def test_guest_cannot_access_private_file_routes(self):
        app = FastAPI()
        app.include_router(routes_files.router)
        app.dependency_overrides[auth.get_current_user] = lambda: SimpleNamespace(
            id=3,
            role="guest",
        )

        with TestClient(app) as client:
            responses = [
                client.get("/files"),
                client.get("/files/1/download"),
                client.delete("/files/1"),
            ]

        self.assertEqual([response.status_code for response in responses], [403, 403, 403])

    def test_admin_still_cannot_download_another_users_file(self):
        file_record = SimpleNamespace(
            id=11,
            owner_id=20,
            original_name="private.txt",
            stored_name="private.upload",
            content_type="text/plain",
        )
        database_stub = DbStub(file_record)
        admin = SimpleNamespace(id=10, role="admin")

        with self.assertRaises(HTTPException) as context:
            download_file(
                file_id=file_record.id,
                current_user=admin,
                db=database_stub,
            )

        self.assertEqual(context.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
