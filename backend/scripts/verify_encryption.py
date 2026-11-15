"""Milestone 2 check: "downloading an object directly from cloud storage does not reveal the original file".

Run it from the backend folder:   python scripts/verify_encryption.py

It does NOT need Docker: it encrypts a sample document in memory, stores it with the same storage class the app
uses (a temporary folder), then reads the raw stored bytes the way someone who broke into the bucket would.
"""
import asyncio
import base64
import os
import sys
import tempfile

# allow "python scripts/verify_encryption.py" from the backend folder
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
os.environ.setdefault("POSTGRES_USER", "x"); os.environ.setdefault("POSTGRES_PASSWORD", "x"); os.environ.setdefault("POSTGRES_DB", "x")
os.environ.setdefault("MONGO_INITDB_ROOT_USERNAME", "x"); os.environ.setdefault("MONGO_INITDB_ROOT_PASSWORD", "x")
os.environ.setdefault("REDIS_PASSWORD", "x"); os.environ.setdefault("JWT_SECRET", "x" * 40)
os.environ.setdefault("MASTER_KEYS", "v1:" + base64.b64encode(os.urandom(32)).decode())

from cryptography.exceptions import InvalidTag  # noqa: E402

from app.core.crypto import get_key_manager  # noqa: E402
from app.core.storage import LocalStorage  # noqa: E402

SECRET = b"%PDF-1.4 CONFIDENTIAL: Project_Report - salary table, passwords, customer list " * 20


def check(label: str, ok: bool) -> None:
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        sys.exit(1)


async def main() -> None:
    km = get_key_manager()
    with tempfile.TemporaryDirectory() as folder:
        storage = LocalStorage(folder)
        payload = km.encrypt_file(SECRET, "demo-file")
        await storage.put("demo/demo-file.enc", payload.ciphertext)

        raw = await storage.get("demo/demo-file.enc")  # what an attacker with bucket access would download
        print("First 32 bytes in storage:", raw[:32].hex())
        check("stored bytes do not contain the readable text", b"CONFIDENTIAL" not in raw and b"%PDF" not in raw)
        check("stored object is not the original file", raw != SECRET)

        back = km.decrypt_file(raw, payload.nonce_b64, payload.wrapped_dek_b64, payload.kek_version, "demo-file")
        check("authorized decryption returns the exact original", back == SECRET)

        tampered = bytearray(raw); tampered[10] ^= 1
        try:
            km.decrypt_file(bytes(tampered), payload.nonce_b64, payload.wrapped_dek_b64, payload.kek_version, "demo-file")
            check("tampered data is rejected", False)
        except InvalidTag:
            check("tampered data is rejected (GCM authentication tag)", True)

        try:  # the same ciphertext moved to another file record must not decrypt
            km.decrypt_file(raw, payload.nonce_b64, payload.wrapped_dek_b64, payload.kek_version, "another-file")
            check("ciphertext cannot be swapped between files", False)
        except InvalidTag:
            check("ciphertext cannot be swapped between files (bound to file id)", True)
    print("\nAll encryption checks passed.")


asyncio.run(main())
