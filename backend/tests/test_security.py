import jwt
import pytest

from app.core import security


def test_password_hash_and_verify():
    h = security.hash_password("Secret123")
    assert h != "Secret123" and security.verify_password("Secret123", h)
    assert not security.verify_password("Wrong123", h)


def test_access_token_roundtrip():
    token, jti = security.create_access_token("user-1", ["user"])
    payload = security.decode_token(token, "access")
    assert payload["sub"] == "user-1" and payload["jti"] == jti and payload["roles"] == ["user"]


def test_refresh_token_cannot_be_used_as_access_token():
    token, _ = security.create_refresh_token("user-1")
    with pytest.raises(jwt.InvalidTokenError):
        security.decode_token(token, "access")


def test_tampered_token_rejected():
    token, _ = security.create_access_token("user-1", ["user"])
    with pytest.raises(jwt.PyJWTError):
        security.decode_token(token[:-2] + "xx", "access")


def test_totp():
    secret = security.new_totp_secret()
    import pyotp
    assert security.verify_totp(secret, pyotp.TOTP(secret).now())


def test_url_tokens_are_unique_and_hashed():
    a, b = security.generate_url_token(), security.generate_url_token()
    assert a != b and len(a) >= 40
    assert security.hash_token(a) != a and len(security.hash_token(a)) == 64
