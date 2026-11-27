import os

import pytest

from app.services import key_service as ks


def provider(active=1, versions=(1, 2)):
    return ks.LocalKeyProvider({v: os.urandom(32) for v in versions}, active)


def test_wrap_unwrap_roundtrip():
    p, dek = provider(), os.urandom(32)
    wrapped, version = p.wrap(dek, "file:1")
    assert wrapped != dek and dek not in wrapped and version == "1"
    assert p.unwrap(wrapped, version, "file:1") == dek


def test_wrapped_key_is_bound_to_its_record():
    p = provider()
    wrapped, v = p.wrap(os.urandom(32), "file-A:1")
    with pytest.raises(ks.KeyError_):
        p.unwrap(wrapped, v, "file-B:1")


def test_rotation_rewraps_and_old_files_stay_readable():
    keys = {1: os.urandom(32), 2: os.urandom(32)}
    old, new = ks.LocalKeyProvider(keys, 1), ks.LocalKeyProvider(keys, 2)
    dek = os.urandom(32)
    wrapped_v1, v1 = old.wrap(dek, "f:1")
    assert new.unwrap(wrapped_v1, v1, "f:1") == dek          # new provider still reads v1 data keys
    wrapped_v2, v2 = new.rewrap(wrapped_v1, v1, "f:1")
    assert v2 == "2" and wrapped_v2 != wrapped_v1
    assert new.unwrap(wrapped_v2, v2, "f:1") == dek          # same DEK after rotation


def test_missing_old_key_fails_cleanly():
    p = ks.LocalKeyProvider({2: os.urandom(32)}, 2)
    with pytest.raises(ks.KeyError_):
        p.unwrap(b"x" * 60, "1", "f:1")


def test_active_version_must_exist():
    with pytest.raises(ks.KeyError_):
        ks.LocalKeyProvider({1: os.urandom(32)}, 3)


def test_protect_and_reveal_secret():
    p = provider()
    stored = ks.protect_secret("JBSWY3DPEHPK3PXP", p)
    assert "JBSWY3DPEHPK3PXP" not in stored
    assert ks.reveal_secret(stored, p) == "JBSWY3DPEHPK3PXP"


def test_end_to_end_envelope_encryption():
    """DEK encrypts the file, KEK wraps the DEK; only wrapped DEK + ciphertext are persisted."""
    from app.services import encryption_service as enc
    p, data, aad = provider(), b"Project_Report.pdf contents", enc.build_aad("f", 1)
    dek = enc.generate_data_key()
    blob = enc.encrypt_bytes(data, dek, aad)
    wrapped, v = p.wrap(dek, aad.decode())
    assert enc.decrypt_bytes(blob, p.unwrap(wrapped, v, aad.decode()), aad) == data
