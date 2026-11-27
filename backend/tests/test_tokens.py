"""Needs the full dependency set (bcrypt, pydantic-settings); run inside the backend container."""
import pytest

pytest.importorskip("bcrypt")
pytest.importorskip("pydantic_settings")

from datetime import timedelta  # noqa: E402

import jwt  # noqa: E402

from app.core import security as sec  # noqa: E402


def test_password_hash_and_verify():
    h = sec.hash_password("S3cure-pass")
    assert h != "S3cure-pass" and sec.verify_password("S3cure-pass", h) and not sec.verify_password("wrong", h)


def test_long_passwords_are_not_truncated():
    base = "a1" * 40
    assert not sec.verify_password(base + "X", sec.hash_password(base + "Y"))


def test_password_policy():
    assert sec.validate_password_strength("short1")
    assert sec.validate_password_strength("onlyletters")
    assert sec.validate_password_strength("Valid-pass-1") is None


def test_jwt_type_and_expiry():
    tok, _ = sec.create_token("u1", "access", timedelta(minutes=5), sid="s")
    assert sec.decode_token(tok, "access")["sub"] == "u1"
    with pytest.raises(jwt.PyJWTError):
        sec.decode_token(tok, "refresh")            # an access token can't be used as a refresh token
    expired, _ = sec.create_token("u1", "access", timedelta(seconds=-1))
    with pytest.raises(jwt.ExpiredSignatureError):
        sec.decode_token(expired, "access")


def test_share_tokens_are_random_and_hashed():
    a, b = sec.generate_secure_token(), sec.generate_secure_token()
    assert a != b and len(a) >= 40
    assert sec.hash_token(a) != a and len(sec.hash_token(a)) == 64
