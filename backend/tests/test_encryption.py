import os
import uuid

import pytest

from app.services import encryption_service as enc


def test_roundtrip():
    key, aad = enc.generate_data_key(), enc.build_aad(uuid.uuid4(), 1)
    data = os.urandom(5000)
    blob = enc.encrypt_bytes(data, key, aad)
    assert data not in blob and blob.startswith(enc.MAGIC)
    assert enc.decrypt_bytes(blob, key, aad) == data


def test_ciphertext_is_not_readable():
    key, aad = enc.generate_data_key(), b"x"
    blob = enc.encrypt_bytes(b"CONFIDENTIAL PROJECT REPORT", key, aad)
    assert b"CONFIDENTIAL" not in blob


def test_unique_nonce_and_ciphertext_each_time():
    key, aad = enc.generate_data_key(), b"x"
    a, b = enc.encrypt_bytes(b"same", key, aad), enc.encrypt_bytes(b"same", key, aad)
    assert a != b and a[4:16] != b[4:16]


def test_each_key_is_256_bits_and_unique():
    k1, k2 = enc.generate_data_key(), enc.generate_data_key()
    assert len(k1) == 32 and k1 != k2


def test_tampering_is_detected():
    key, aad = enc.generate_data_key(), b"x"
    blob = bytearray(enc.encrypt_bytes(b"important data" * 10, key, aad))
    blob[-5] ^= 0x01
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(bytes(blob), key, aad)


def test_truncation_is_detected():
    key, aad = enc.generate_data_key(), b"x"
    blob = enc.encrypt_bytes(b"important data" * 10, key, aad)
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(blob[:-10], key, aad)


def test_wrong_key_rejected():
    aad = b"x"
    blob = enc.encrypt_bytes(b"data", enc.generate_data_key(), aad)
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(blob, enc.generate_data_key(), aad)


def test_object_swapped_between_files_is_rejected():
    """AAD binds ciphertext to its file record: copying it to another record fails."""
    key = enc.generate_data_key()
    blob = enc.encrypt_bytes(b"data", key, enc.build_aad(uuid.uuid4(), 1))
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(blob, key, enc.build_aad(uuid.uuid4(), 1))


def test_garbage_and_short_input_rejected():
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(b"not encrypted at all", enc.generate_data_key(), b"x")
    with pytest.raises(enc.DecryptionError):
        enc.decrypt_bytes(b"", enc.generate_data_key(), b"x")


def test_empty_plaintext_ok():
    key = enc.generate_data_key()
    assert enc.decrypt_bytes(enc.encrypt_bytes(b"", key, b"a"), key, b"a") == b""
