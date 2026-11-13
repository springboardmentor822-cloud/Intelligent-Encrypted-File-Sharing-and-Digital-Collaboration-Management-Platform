"""Private object storage abstraction. Only ciphertext is ever handed to these classes."""
import re, secrets
from pathlib import Path
from ..config import Settings


class StorageError(Exception): ...
class ObjectNotFound(StorageError): ...


_KEY_RE = re.compile(r"^[0-9a-f]{2}/[0-9a-f]{46}$")


def new_key() -> str:
    t = secrets.token_hex(24)
    return f"{t[:2]}/{t[2:]}"


class LocalStorage:
    name = "local"

    def __init__(self, root: str):
        self.root = Path(root).resolve()
        self.root.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        if not _KEY_RE.match(key):
            raise StorageError("invalid storage key")
        p = (self.root / key).resolve()
        if self.root not in p.parents:
            raise StorageError("path escapes storage root")
        return p

    def put(self, key: str, data: bytes) -> None:
        p = self._path(key)
        p.parent.mkdir(parents=True, exist_ok=True)
        tmp = p.with_suffix(".tmp")
        tmp.write_bytes(data)
        tmp.replace(p)

    def get(self, key: str) -> bytes:
        p = self._path(key)
        if not p.exists():
            raise ObjectNotFound(key)
        return p.read_bytes()

    def delete(self, key: str) -> None:
        self._path(key).unlink(missing_ok=True)

    def size(self, key: str) -> int:
        p = self._path(key)
        if not p.exists():
            raise ObjectNotFound(key)
        return p.stat().st_size

    def check(self) -> dict:
        k = new_key(); self.put(k, b"probe")
        ok = self.get(k) == b"probe"; self.delete(k)
        return {"backend": "local", "ok": ok}


class S3Storage:
    name = "s3"

    def __init__(self, s: Settings):
        import boto3
        from botocore.config import Config
        if not s.s3_bucket:
            raise StorageError("TS_S3_BUCKET is not configured")
        self.bucket, self.prefix = s.s3_bucket, s.s3_prefix
        self.client = boto3.client(
            "s3", region_name=s.s3_region or None, endpoint_url=s.s3_endpoint_url or None,
            config=Config(retries={"max_attempts": 5, "mode": "standard"}, connect_timeout=5, read_timeout=30))

    def _k(self, key: str) -> str:
        if not _KEY_RE.match(key):
            raise StorageError("invalid storage key")
        return self.prefix + key

    def put(self, key, data):
        try:
            self.client.put_object(Bucket=self.bucket, Key=self._k(key), Body=data, ServerSideEncryption="AES256",
                                   ContentType="application/octet-stream")
        except Exception as e:
            raise StorageError(f"S3 put failed: {type(e).__name__}") from e

    def get(self, key):
        try:
            return self.client.get_object(Bucket=self.bucket, Key=self._k(key))["Body"].read()
        except self.client.exceptions.NoSuchKey as e:
            raise ObjectNotFound(key) from e
        except Exception as e:
            raise StorageError(f"S3 get failed: {type(e).__name__}") from e

    def delete(self, key):
        try:
            self.client.delete_object(Bucket=self.bucket, Key=self._k(key))
        except Exception as e:
            raise StorageError(f"S3 delete failed: {type(e).__name__}") from e

    def size(self, key):
        try:
            return self.client.head_object(Bucket=self.bucket, Key=self._k(key))["ContentLength"]
        except Exception as e:
            raise ObjectNotFound(key) from e

    def check(self) -> dict:
        """Real round-trip against the bucket; also reports whether Public Access Block is fully enabled."""
        k = new_key(); self.put(k, b"probe")
        ok = self.get(k) == b"probe"; self.delete(k)
        pab = None
        try:
            c = self.client.get_public_access_block(Bucket=self.bucket)["PublicAccessBlockConfiguration"]
            pab = all(c.values())
        except Exception:
            pab = None   # unknown (insufficient permission or not set)
        return {"backend": "s3", "ok": ok, "public_access_blocked": pab}


def build_storage(s: Settings):
    if s.storage_backend == "s3":
        return S3Storage(s)
    return LocalStorage(s.local_storage_dir)
