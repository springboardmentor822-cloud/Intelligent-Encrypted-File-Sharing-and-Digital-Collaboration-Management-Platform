"""
TrustShare - Milestone 2: Cloud Storage Integration Service (AWS S3 & Azure Blob Storage)
========================================================================================
Implements Task Two:
1. Private Storage Bucket / Container Abstraction.
2. AWS S3 Integration (with MinIO / LocalStack / S3-compatible support).
3. Azure Blob Storage Integration.
4. Local Private Storage Provider (secure local offline / testing fallback).
5. Enforces zero plaintext storage: only AES-256-GCM ciphertext is saved.
6. Cloud credentials isolated in environment variables.
"""

import os
import io
import logging
from abc import ABC, abstractmethod
from pathlib import Path
from typing import Tuple, Optional

logger = logging.getLogger("trustshare.storage")

# Default local storage path
STORAGE_DIR = Path(__file__).resolve().parent.parent.parent / "storage" / "uploads"
STORAGE_DIR.mkdir(parents=True, exist_ok=True)


class BaseStorageProvider(ABC):
    """Abstract base class for private encrypted storage backends."""

    @abstractmethod
    def save_ciphertext(self, stored_filename: str, ciphertext_bytes: bytes) -> Tuple[int, str]:
        """Saves encrypted ciphertext bytes. Returns (byte_count, storage_reference_path)."""
        pass

    @abstractmethod
    def read_ciphertext(self, stored_filename: str) -> bytes:
        """Retrieves raw encrypted ciphertext bytes from storage."""
        pass

    @abstractmethod
    def delete_file(self, stored_filename: str) -> bool:
        """Deletes encrypted file from storage."""
        pass

    @abstractmethod
    def exists(self, stored_filename: str) -> bool:
        """Checks if encrypted object exists in storage."""
        pass

    @abstractmethod
    def get_provider_name(self) -> str:
        """Returns provider identifier: 's3', 'azure', or 'local'."""
        pass


class LocalStorageProvider(BaseStorageProvider):
    """
    Local filesystem secure storage.
    Writes strictly AES-256 encrypted blobs with zero plaintext on disk.
    """

    def __init__(self, base_dir: Path = STORAGE_DIR):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def get_absolute_path(self, stored_filename: str) -> Path:
        return self.base_dir / stored_filename

    def save_ciphertext(self, stored_filename: str, ciphertext_bytes: bytes) -> Tuple[int, str]:
        dest_path = self.get_absolute_path(stored_filename)
        with open(dest_path, "wb") as f:
            f.write(ciphertext_bytes)
        return len(ciphertext_bytes), str(dest_path.relative_to(self.base_dir.parent))

    def read_ciphertext(self, stored_filename: str) -> bytes:
        file_path = self.get_absolute_path(stored_filename)
        if not file_path.exists():
            raise FileNotFoundError(f"Stored encrypted file '{stored_filename}' not found.")
        with open(file_path, "rb") as f:
            return f.read()

    def delete_file(self, stored_filename: str) -> bool:
        file_path = self.get_absolute_path(stored_filename)
        if file_path.exists():
            file_path.unlink()
            return True
        return False

    def exists(self, stored_filename: str) -> bool:
        return self.get_absolute_path(stored_filename).exists()

    def get_provider_name(self) -> str:
        return "local"


class S3StorageProvider(BaseStorageProvider):
    """
    Amazon Simple Storage Service (AWS S3) Private Bucket Integration.
    Uploads, retrieves, and deletes AES-256 encrypted blobs from a private S3 bucket.
    Zero plaintext is ever transmitted to or stored in S3.
    """

    def __init__(
        self,
        bucket_name: Optional[str] = None,
        region_name: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        endpoint_url: Optional[str] = None,
    ):
        self.bucket_name = bucket_name or os.getenv("AWS_S3_BUCKET", "trustshare-private-vault")
        self.region_name = region_name or os.getenv("AWS_REGION", "us-east-1")
        self.access_key = access_key or os.getenv("AWS_ACCESS_KEY_ID")
        self.secret_key = secret_key or os.getenv("AWS_SECRET_ACCESS_KEY")
        self.endpoint_url = endpoint_url or os.getenv("S3_ENDPOINT_URL")

        self.client = None
        self._init_s3_client()

    def _init_s3_client(self):
        try:
            import boto3
            from botocore.config import Config

            cfg = Config(signature_version="s3v4", retries={"max_attempts": 3, "mode": "standard"})
            client_kwargs = {
                "service_name": "s3",
                "region_name": self.region_name,
                "config": cfg,
            }
            if self.access_key and self.secret_key:
                client_kwargs["aws_access_key_id"] = self.access_key
                client_kwargs["aws_secret_access_key"] = self.secret_key
            if self.endpoint_url:
                client_kwargs["endpoint_url"] = self.endpoint_url

            self.client = boto3.client(**client_kwargs)
        except Exception as e:
            logger.warning(f"Could not initialize boto3 S3 client: {e}")
            self.client = None

    def _get_key(self, stored_filename: str) -> str:
        return f"encrypted_vault/{stored_filename}"

    def save_ciphertext(self, stored_filename: str, ciphertext_bytes: bytes) -> Tuple[int, str]:
        if not self.client:
            raise RuntimeError("S3 client is not available. Check AWS credentials.")
        key = self._get_key(stored_filename)
        self.client.put_object(
            Bucket=self.bucket_name,
            Key=key,
            Body=ciphertext_bytes,
            ContentType="application/octet-stream",
            Metadata={"encrypted": "true", "algorithm": "AES-256-GCM"},
        )
        return len(ciphertext_bytes), f"s3://{self.bucket_name}/{key}"

    def read_ciphertext(self, stored_filename: str) -> bytes:
        if not self.client:
            raise RuntimeError("S3 client is not available. Check AWS credentials.")
        key = self._get_key(stored_filename)
        resp = self.client.get_object(Bucket=self.bucket_name, Key=key)
        return resp["Body"].read()

    def delete_file(self, stored_filename: str) -> bool:
        if not self.client:
            return False
        key = self._get_key(stored_filename)
        try:
            self.client.delete_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception as e:
            logger.error(f"Error deleting object from S3: {e}")
            return False

    def exists(self, stored_filename: str) -> bool:
        if not self.client:
            return False
        key = self._get_key(stored_filename)
        try:
            self.client.head_object(Bucket=self.bucket_name, Key=key)
            return True
        except Exception:
            return False

    def get_provider_name(self) -> str:
        return "s3"


class AzureBlobStorageProvider(BaseStorageProvider):
    """
    Azure Blob Storage Private Container Integration.
    Uploads, retrieves, and deletes AES-256 encrypted blobs from a private Azure container.
    """

    def __init__(
        self,
        connection_string: Optional[str] = None,
        container_name: Optional[str] = None
    ):
        self.connection_string = connection_string or os.getenv("AZURE_STORAGE_CONNECTION_STRING")
        self.container_name = container_name or os.getenv("AZURE_CONTAINER_NAME", "trustshare-private-vault")
        self.blob_service_client = None
        self._init_azure_client()

    def _init_azure_client(self):
        if not self.connection_string:
            return
        try:
            from azure.storage.blob import BlobServiceClient
            self.blob_service_client = BlobServiceClient.from_connection_string(self.connection_string)
        except Exception as e:
            logger.warning(f"Azure Blob storage client initialization: {e}")
            self.blob_service_client = None

    def save_ciphertext(self, stored_filename: str, ciphertext_bytes: bytes) -> Tuple[int, str]:
        if not self.blob_service_client:
            raise RuntimeError("Azure Blob storage client is not configured.")
        container_client = self.blob_service_client.get_container_client(self.container_name)
        blob_client = container_client.get_blob_client(stored_filename)
        blob_client.upload_blob(ciphertext_bytes, overwrite=True)
        return len(ciphertext_bytes), f"azure://{self.container_name}/{stored_filename}"

    def read_ciphertext(self, stored_filename: str) -> bytes:
        if not self.blob_service_client:
            raise RuntimeError("Azure Blob storage client is not configured.")
        container_client = self.blob_service_client.get_container_client(self.container_name)
        blob_client = container_client.get_blob_client(stored_filename)
        return blob_client.download_blob().readall()

    def delete_file(self, stored_filename: str) -> bool:
        if not self.blob_service_client:
            return False
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_client = container_client.get_blob_client(stored_filename)
            blob_client.delete_blob()
            return True
        except Exception:
            return False

    def exists(self, stored_filename: str) -> bool:
        if not self.blob_service_client:
            return False
        try:
            container_client = self.blob_service_client.get_container_client(self.container_name)
            blob_client = container_client.get_blob_client(stored_filename)
            return blob_client.exists()
        except Exception:
            return False

    def get_provider_name(self) -> str:
        return "azure"


class SecureStorageService:
    """
    Unified Secure Storage Abstraction Layer for Milestone 2.
    Stores AES-256-GCM encrypted binary blobs with zero plaintext on disk or cloud.
    Automatically manages local, AWS S3, or Azure Blob Storage providers.
    """

    def __init__(self, base_dir: Path = STORAGE_DIR):
        self.local_provider = LocalStorageProvider(base_dir=base_dir)
        self.active_provider: BaseStorageProvider = self._select_provider()

    def _select_provider(self) -> BaseStorageProvider:
        backend_choice = os.getenv("STORAGE_BACKEND", "").lower().strip()
        aws_key = os.getenv("AWS_ACCESS_KEY_ID")

        if backend_choice == "s3" or (backend_choice != "local" and aws_key):
            try:
                s3_provider = S3StorageProvider()
                if s3_provider.client is not None:
                    return s3_provider
            except Exception as e:
                logger.warning(f"Failed to activate S3 provider, falling back to local: {e}")

        if backend_choice == "azure" or os.getenv("AZURE_STORAGE_CONNECTION_STRING"):
            try:
                azure_provider = AzureBlobStorageProvider()
                if azure_provider.blob_service_client is not None:
                    return azure_provider
            except Exception as e:
                logger.warning(f"Failed to activate Azure provider, falling back to local: {e}")

        return self.local_provider

    def set_provider(self, provider: BaseStorageProvider):
        """Allows dynamic switching of storage providers (e.g., during tests)."""
        self.active_provider = provider

    def get_absolute_path(self, stored_filename: str) -> Path:
        """Always provides local path reference (e.g. for legacy or local mode)."""
        return self.local_provider.get_absolute_path(stored_filename)

    def save_ciphertext(self, stored_filename: str, ciphertext_bytes: bytes) -> Tuple[int, str]:
        """
        Saves AES-256 encrypted payload to the active storage provider.
        Also mirrors to local vault for caching and offline resilience.
        Zero plaintext is written to persistent storage.
        """
        # Always write to local vault as primary or cache
        self.local_provider.save_ciphertext(stored_filename, ciphertext_bytes)

        if self.active_provider.get_provider_name() != "local":
            try:
                return self.active_provider.save_ciphertext(stored_filename, ciphertext_bytes)
            except Exception as e:
                logger.warning(f"Cloud storage upload error ({self.active_provider.get_provider_name()}): {e}. Using local.")
        
        return self.local_provider.save_ciphertext(stored_filename, ciphertext_bytes)

    def read_ciphertext(self, stored_filename: str) -> bytes:
        """
        Retrieves the raw encrypted blob from active storage provider or local cache.
        """
        # If active provider is cloud, try cloud first
        if self.active_provider.get_provider_name() != "local":
            try:
                return self.active_provider.read_ciphertext(stored_filename)
            except Exception as e:
                logger.warning(f"Cloud read error: {e}. Falling back to local cache.")

        # Fallback / default to local vault
        return self.local_provider.read_ciphertext(stored_filename)

    def delete_file(self, stored_filename: str) -> bool:
        """Deletes object from both active cloud provider and local storage."""
        cloud_deleted = False
        if self.active_provider.get_provider_name() != "local":
            try:
                cloud_deleted = self.active_provider.delete_file(stored_filename)
            except Exception as e:
                logger.warning(f"Cloud delete error: {e}")

        local_deleted = self.local_provider.delete_file(stored_filename)
        return cloud_deleted or local_deleted

    def exists(self, stored_filename: str) -> bool:
        """Checks existence in active provider or local storage."""
        if self.active_provider.get_provider_name() != "local":
            try:
                if self.active_provider.exists(stored_filename):
                    return True
            except Exception:
                pass
        return self.local_provider.exists(stored_filename)

    @property
    def provider_name(self) -> str:
        return self.active_provider.get_provider_name()


storage_service = SecureStorageService()
