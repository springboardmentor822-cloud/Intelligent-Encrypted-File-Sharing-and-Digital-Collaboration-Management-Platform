
"""Private local, Amazon S3, and Azure Blob object storage.

Cloud storage receives encrypted payloads from the calling service.
"""

import logging
import os
from functools import lru_cache

from fastapi import HTTPException

logger = logging.getLogger(__name__)


def configured_backend() -> str:
    backend = os.getenv("FILE_STORAGE_BACKEND", "local").strip().lower()

    if backend not in {"local", "s3", "azure"}:
        raise HTTPException(
            status_code=503,
            detail="FILE_STORAGE_BACKEND must be local, s3, or azure.",
        )

    if backend == "s3" and not os.getenv("S3_BUCKET", "").strip():
        raise HTTPException(
            status_code=503,
            detail="S3_BUCKET is required when FILE_STORAGE_BACKEND=s3.",
        )

    if backend == "azure":
        if not os.getenv("AZURE_STORAGE_CONTAINER", "").strip():
            raise HTTPException(
                status_code=503,
                detail="AZURE_STORAGE_CONTAINER is required for Azure storage.",
            )

        if not (
            os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()
            or os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
        ):
            raise HTTPException(
                status_code=503,
                detail="Configure the Azure Storage account URL or account name.",
            )

    return backend


@lru_cache(maxsize=1)
def _s3_client():
    try:
        import boto3
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="S3 storage requires the backend boto3 dependency.",
        ) from exc

    region = os.getenv("AWS_REGION", "").strip() or None

    try:
        return boto3.client("s3", region_name=region)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="AWS S3 storage could not be configured.",
        ) from exc


@lru_cache(maxsize=1)
def _azure_service_client():
    try:
        from azure.identity import DefaultAzureCredential
        from azure.storage.blob import BlobServiceClient
    except ImportError as exc:
        raise HTTPException(
            status_code=503,
            detail="Azure storage requires azure-identity and azure-storage-blob.",
        ) from exc

    account_url = os.getenv("AZURE_STORAGE_ACCOUNT_URL", "").strip()

    if not account_url:
        account_name = os.getenv("AZURE_STORAGE_ACCOUNT_NAME", "").strip()
        account_url = f"https://{account_name}.blob.core.windows.net"

    try:
        credential = DefaultAzureCredential()
        return BlobServiceClient(
            account_url=account_url,
            credential=credential,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Azure Blob Storage could not be configured.",
        ) from exc


def _azure_blob_client(key: str):
    container = os.environ["AZURE_STORAGE_CONTAINER"].strip()
    return _azure_service_client().get_blob_client(
        container=container,
        blob=key,
    )


def _is_azure_not_found(exc: Exception) -> bool:
    try:
        from azure.core.exceptions import ResourceNotFoundError

        return isinstance(exc, ResourceNotFoundError)
    except ImportError:
        return False


def put_object(key: str, data: bytes, backend: str, local_path=None) -> None:
    if backend == "local":
        if local_path is None:
            raise ValueError("A local object path is required.")

        local_path.parent.mkdir(parents=True, exist_ok=True)
        with local_path.open("wb") as output:
            output.write(data)
        return

    if backend == "azure":
        try:
            _azure_blob_client(key).upload_blob(data, overwrite=True)
            return
        except Exception as exc:
            logger.exception(
                "Azure blob upload failed. Error type: %s",
                type(exc).__name__,
            )
            raise HTTPException(
                status_code=503,
                detail="The encrypted object could not be stored in Azure.",
            ) from exc

    if backend != "s3":
        raise HTTPException(status_code=503, detail="Unsupported storage backend.")

    try:
        _s3_client().put_object(
            Bucket=os.environ["S3_BUCKET"],
            Key=key,
            Body=data,
            ContentType="application/octet-stream",
            ServerSideEncryption="AES256",
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The encrypted object could not be stored in S3.",
        ) from exc


def get_object(key: str, backend: str, local_path=None) -> bytes:
    if backend == "local":
        if local_path is None:
            raise ValueError("A local object path is required.")

        try:
            return local_path.read_bytes()
        except OSError as exc:
            raise HTTPException(
                status_code=404,
                detail="Stored file is missing.",
            ) from exc

    if backend == "azure":
        try:
            return _azure_blob_client(key).download_blob().readall()
        except Exception as exc:
            if _is_azure_not_found(exc):
                raise HTTPException(
                    status_code=404,
                    detail="Stored file is missing.",
                ) from exc

            raise HTTPException(
                status_code=503,
                detail="The stored object could not be retrieved from Azure.",
            ) from exc

    if backend != "s3":
        raise HTTPException(status_code=503, detail="Unsupported storage backend.")

    try:
        result = _s3_client().get_object(
            Bucket=os.environ["S3_BUCKET"],
            Key=key,
        )
        return result["Body"].read()
    except Exception as exc:
        response = getattr(exc, "response", {})
        code = response.get("Error", {}).get("Code")

        if code in {"NoSuchKey", "404", "NotFound"}:
            raise HTTPException(
                status_code=404,
                detail="Stored file is missing.",
            ) from exc

        raise HTTPException(
            status_code=503,
            detail="The stored object could not be retrieved.",
        ) from exc


def object_exists(key: str, backend: str, local_path=None) -> bool:
    if backend == "local":
        return bool(local_path is not None and local_path.is_file())

    if backend == "azure":
        try:
            _azure_blob_client(key).get_blob_properties()
            return True
        except Exception as exc:
            if _is_azure_not_found(exc):
                return False

            raise HTTPException(
                status_code=503,
                detail="The stored object could not be checked in Azure.",
            ) from exc

    if backend != "s3":
        raise HTTPException(status_code=503, detail="Unsupported storage backend.")

    try:
        _s3_client().head_object(
            Bucket=os.environ["S3_BUCKET"],
            Key=key,
        )
        return True
    except Exception as exc:
        response = getattr(exc, "response", {})

        if response.get("Error", {}).get("Code") in {
            "NoSuchKey",
            "404",
            "NotFound",
        }:
            return False

        raise HTTPException(
            status_code=503,
            detail="The stored object could not be checked.",
        ) from exc


def delete_object(key: str, backend: str, local_path=None) -> None:
    if backend == "local":
        if local_path is not None:
            local_path.unlink(missing_ok=True)
        return

    if backend == "azure":
        try:
            _azure_blob_client(key).delete_blob(delete_snapshots="include")
            return
        except Exception as exc:
            if _is_azure_not_found(exc):
                return

            raise HTTPException(
                status_code=503,
                detail="The stored object could not be removed from Azure.",
            ) from exc

    if backend != "s3":
        raise HTTPException(status_code=503, detail="Unsupported storage backend.")

    try:
        _s3_client().delete_object(
            Bucket=os.environ["S3_BUCKET"],
            Key=key,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="The stored object could not be removed.",
        ) from exc


def object_length(key: str, backend: str, local_path=None) -> int:
    if backend == "local":
        try:
            return local_path.stat().st_size
        except (OSError, AttributeError) as exc:
            raise HTTPException(
                status_code=404,
                detail="Stored file is missing.",
            ) from exc

    if backend == "azure":
        try:
            properties = _azure_blob_client(key).get_blob_properties()
            return int(properties.size)
        except Exception as exc:
            if _is_azure_not_found(exc):
                raise HTTPException(
                    status_code=404,
                    detail="Stored file is missing.",
                ) from exc

            raise HTTPException(
                status_code=503,
                detail="Stored object metadata is unavailable in Azure.",
            ) from exc

    if backend != "s3":
        raise HTTPException(status_code=503, detail="Unsupported storage backend.")

    try:
        return int(
            _s3_client().head_object(
                Bucket=os.environ["S3_BUCKET"],
                Key=key,
            )["ContentLength"]
        )
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail="Stored object metadata is unavailable.",
        ) from exc
