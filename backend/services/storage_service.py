"""Object storage for encrypted files. Only ciphertext ever reaches this layer.

Backends (env STORAGE_BACKEND):
  local : files are written under LOCAL_STORAGE_PATH (default /app/storage). Simple, no extra services. Good for development.
  s3    : AWS S3 (or any S3-compatible server via S3_ENDPOINT_URL). Recommended for production.
"""
import logging
import os
from pathlib import Path

from app.core.config import settings

log = logging.getLogger("trustshare.storage")

BACKEND = os.getenv("STORAGE_BACKEND", "s3").lower()
LOCAL_ROOT = Path(os.getenv("LOCAL_STORAGE_PATH", "/app/storage"))
_client = None


class StorageError(Exception):
    pass


# ----------------------------------------------------------------- local filesystem
def _local_path(key: str) -> Path:
    root = LOCAL_ROOT.resolve()
    path = (root / key).resolve()
    if root not in path.parents:  # refuse any key that escapes the storage folder
        raise StorageError("invalid storage key")
    return path


def _local_put(key: str, data: bytes) -> None:
    path = _local_path(key)
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(".tmp")
        tmp.write_bytes(data)
        os.replace(tmp, path)  # atomic: a half-written file is never visible
    except OSError as exc:
        log.exception("local put failed")
        raise StorageError(f"could not store the file ({type(exc).__name__}: {exc})") from exc


def _local_get(key: str) -> bytes:
    try:
        return _local_path(key).read_bytes()
    except OSError as exc:
        log.exception("local get failed")
        raise StorageError(f"could not read the stored file ({type(exc).__name__})") from exc


def _local_delete(key: str) -> None:
    try:
        _local_path(key).unlink(missing_ok=True)
    except (OSError, StorageError):
        pass


# ----------------------------------------------------------------- S3
def _s3():
    global _client
    if _client is None:
        import boto3
        from botocore.client import Config

        use_path_style = bool(settings.s3_endpoint_url)
        _client = boto3.client(
            "s3",
            endpoint_url=settings.s3_endpoint_url or None,
            region_name=settings.s3_region,
            aws_access_key_id=settings.s3_access_key or None,   # empty -> IAM role / default chain
            aws_secret_access_key=settings.s3_secret_key or None,
            config=Config(signature_version="s3v4", s3={"addressing_style": "path" if use_path_style else "auto"},
                          connect_timeout=5, read_timeout=60, retries={"max_attempts": 3}),
        )
    return _client


def _s3_put(key: str, data: bytes) -> None:
    from botocore.exceptions import BotoCoreError, ClientError

    extra = {"ServerSideEncryption": "AES256"} if settings.s3_sse else {}
    try:
        _s3().put_object(Bucket=settings.s3_bucket, Key=key, Body=data, ContentType="application/octet-stream", **extra)
    except (ClientError, BotoCoreError) as exc:
        log.exception("S3 put_object failed")
        raise StorageError(f"could not store the file ({type(exc).__name__}: {str(exc)[:160]})") from exc


def _s3_get(key: str) -> bytes:
    from botocore.exceptions import BotoCoreError, ClientError

    try:
        return _s3().get_object(Bucket=settings.s3_bucket, Key=key)["Body"].read()
    except (ClientError, BotoCoreError) as exc:
        log.exception("S3 get_object failed")
        raise StorageError(f"could not read the stored file ({type(exc).__name__}: {str(exc)[:160]})") from exc


def _s3_ensure_bucket() -> None:
    from botocore.exceptions import BotoCoreError, ClientError

    s3 = _s3()
    try:
        s3.head_bucket(Bucket=settings.s3_bucket)
    except ClientError:
        log.info("Creating bucket %s", settings.s3_bucket)
        args = {"Bucket": settings.s3_bucket}
        if settings.s3_region != "us-east-1" and not settings.s3_endpoint_url:
            args["CreateBucketConfiguration"] = {"LocationConstraint": settings.s3_region}
        s3.create_bucket(**args)
    try:  # the bucket must never be public
        s3.put_public_access_block(
            Bucket=settings.s3_bucket,
            PublicAccessBlockConfiguration={"BlockPublicAcls": True, "IgnorePublicAcls": True,
                                            "BlockPublicPolicy": True, "RestrictPublicBuckets": True})
    except (ClientError, BotoCoreError):
        pass


# ----------------------------------------------------------------- public API
def ensure_bucket() -> None:
    if BACKEND == "local":
        LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
        log.info("Using local encrypted-file storage at %s", LOCAL_ROOT)
    else:
        _s3_ensure_bucket()


def put_object(key: str, data: bytes) -> None:
    _local_put(key, data) if BACKEND == "local" else _s3_put(key, data)


def get_object(key: str) -> bytes:
    return _local_get(key) if BACKEND == "local" else _s3_get(key)


def delete_object(key: str) -> None:
    if BACKEND == "local":
        _local_delete(key)
        return
    try:
        _s3().delete_object(Bucket=settings.s3_bucket, Key=key)
    except Exception:  # noqa: BLE001
        pass


def ping() -> bool:
    try:
        if BACKEND == "local":
            LOCAL_ROOT.mkdir(parents=True, exist_ok=True)
            return os.access(LOCAL_ROOT, os.W_OK)
        _s3().head_bucket(Bucket=settings.s3_bucket)
        return True
    except Exception:  # noqa: BLE001
        return False