"""Encryption / decryption integrity checks."""
import os

import pytest
from cryptography.exceptions import InvalidTag

from app.core.crypto import KeyManager


def make_km(current="v1"):
    return KeyManager({"v1": os.urandom(32), "v2": os.urandom(32)}, current)


def test_roundtrip():
    km = make_km()
    data = os.urandom(100_000)
    p = km.encrypt_file(data, "file1")
    assert p.ciphertext != data
    assert km.decrypt_file(p.ciphertext, p.nonce_b64, p.wrapped_dek_b64, p.kek_version, "file1") == data


def test_ciphertext_does_not_contain_plaintext():
    km = make_km()
    p = km.encrypt_file(b"TOP SECRET CONTENT " * 50, "f")
    assert b"TOP SECRET" not in p.ciphertext


def test_same_file_gives_different_ciphertext():
    km = make_km()
    a, b = km.encrypt_file(b"same", "f"), km.encrypt_file(b"same", "f")
    assert a.ciphertext != b.ciphertext and a.nonce_b64 != b.nonce_b64


def test_tampered_ciphertext_is_rejected():
    km = make_km()
    p = km.encrypt_file(b"hello world", "f")
    bad = bytearray(p.ciphertext)
    bad[0] ^= 1
    with pytest.raises(InvalidTag):
        km.decrypt_file(bytes(bad), p.nonce_b64, p.wrapped_dek_b64, p.kek_version, "f")


def test_wrong_file_id_is_rejected():
    km = make_km()
    p = km.encrypt_file(b"hello", "file-a")
    with pytest.raises(InvalidTag):
        km.decrypt_file(p.ciphertext, p.nonce_b64, p.wrapped_dek_b64, p.kek_version, "file-b")


def test_key_rotation_keeps_file_readable():
    keys = {"v1": os.urandom(32), "v2": os.urandom(32)}
    old = KeyManager(keys, "v1")
    p = old.encrypt_file(b"rotate me", "f")
    new = KeyManager(keys, "v2")
    wrapped, version = new.rewrap_dek(p.wrapped_dek_b64, "v1", "f")
    assert version == "v2" and wrapped != p.wrapped_dek_b64
    assert new.decrypt_file(p.ciphertext, p.nonce_b64, wrapped, version, "f") == b"rotate me"


def test_master_key_must_be_32_bytes():
    with pytest.raises(ValueError):
        KeyManager({"v1": b"short"}, "v1")
