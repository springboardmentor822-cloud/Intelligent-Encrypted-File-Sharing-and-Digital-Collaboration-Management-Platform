"""Pluggable storage: Local disk (development) or AWS S3 (production).
Both store only ENCRYPTED bytes."""
import asyncio
from abc import ABC, abstractmethod
from pathlib import Path

from app.core.config import settings


class StorageBackend(ABC):
    @abstractmethod
    async def put(self, key: str, data: bytes) -> None: ...

    @abstractmethod
    async def get(self, key: str) -> bytes: ...

    @abstractmethod
    async def delete(self, key: str) -> None: ...


class LocalStorage(StorageBackend):
    def __init__(self, base_path: str):
        self.base = Path(base_path).resolve()
        self.base.mkdir(parents=True, exist_ok=True)

    def _path(self, key: str) -> Path:
        path = (self.base / key).resolve()
        if self.base not in path.parents:  # stops path traversal like ../../etc
            raise ValueError("Invalid storage key")
        return path

    async def put(self, key: str, data: bytes) -> None:
        def _write():
            path = self._path(key)
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(data)

        await asyncio.to_thread(_write)

    async def get(self, key: str) -> bytes:
        return await asyncio.to_thread(lambda: self._path(key).read_bytes())

    async def delete(self, key: str) -> None:
        def _delete():
            path = self._path(key)
            if path.exists():
                path.unlink()

        await asyncio.to_thread(_delete)


class S3Storage(StorageBackend):
    def __init__(self):
        import boto3

        kwargs = {"region_name": settings.S3_REGION}
        if settings.AWS_ACCESS_KEY_ID:
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        self.client = boto3.client("s3", **kwargs)
        self.bucket = settings.S3_BUCKET

    async def put(self, key: str, data: bytes) -> None:
        # Our own AES-256 encryption already protects the bytes. "AES256" asks S3 to ALSO encrypt them on its disks
        # (defense in depth). The content type is generic so S3 never knows what the file is.
        await asyncio.to_thread(self.client.put_object, Bucket=self.bucket, Key=key, Body=data,
                                ServerSideEncryption="AES256", ContentType="application/octet-stream")

    async def get(self, key: str) -> bytes:
        def _get():
            return self.client.get_object(Bucket=self.bucket, Key=key)["Body"].read()

        return await asyncio.to_thread(_get)

    async def delete(self, key: str) -> None:
        await asyncio.to_thread(self.client.delete_object, Bucket=self.bucket, Key=key)


_storage: StorageBackend | None = None


def get_storage() -> StorageBackend:
    global _storage
    if _storage is None:
        _storage = S3Storage() if settings.STORAGE_BACKEND == "s3" else LocalStorage(settings.LOCAL_STORAGE_PATH)
    return _storage
