import os
import re
import boto3
from botocore.exceptions import ClientError
from typing import Optional, Tuple
from app.core.config import settings


class StorageService:
    """
    Storage Service for Milestone 2: Cloud Storage & Private Encrypted Vault.
    Complies with Milestone 2 Specification (Task Two):
    - Securely stores AES-256 encrypted ciphertext objects (never plaintext).
    - Supports AWS S3 / MinIO S3-compatible cloud object storage.
    - Includes hardened private local vault fallback when offline/local.
    - Credentials managed strictly through environment variables.
    """

    VAULT_DIR = settings.UPLOAD_DIR
    _s3_client = None

    @classmethod
    def initialize(cls):
        """Initializes local vault storage directory and checks S3 readiness."""
        os.makedirs(cls.VAULT_DIR, exist_ok=True)
        if cls.is_s3_enabled():
            cls.get_s3_client()

    @classmethod
    def is_s3_enabled(cls) -> bool:
        """Determines whether AWS S3 / MinIO cloud storage is active."""
        backend = getattr(settings, "STORAGE_BACKEND", "local").lower()
        has_credentials = bool(
            getattr(settings, "AWS_ACCESS_KEY_ID", None)
            and getattr(settings, "AWS_SECRET_ACCESS_KEY", None)
        )
        has_endpoint = bool(getattr(settings, "AWS_S3_ENDPOINT_URL", None))
        return backend == "s3" or has_credentials or (backend != "local" and has_endpoint)

    @classmethod
    def get_s3_client(cls):
        """Initializes or returns the singleton boto3 S3 client."""
        if cls._s3_client is not None:
            return cls._s3_client

        kwargs = {
            "region_name": getattr(settings, "AWS_REGION", "us-east-1"),
        }
        if getattr(settings, "AWS_ACCESS_KEY_ID", None):
            kwargs["aws_access_key_id"] = settings.AWS_ACCESS_KEY_ID
        if getattr(settings, "AWS_SECRET_ACCESS_KEY", None):
            kwargs["aws_secret_access_key"] = settings.AWS_SECRET_ACCESS_KEY
        if getattr(settings, "AWS_S3_ENDPOINT_URL", None):
            kwargs["endpoint_url"] = settings.AWS_S3_ENDPOINT_URL

        cls._s3_client = boto3.client("s3", **kwargs)

        # Ensure private bucket exists if permitted
        bucket = getattr(settings, "AWS_S3_BUCKET", "trustshare-encrypted-vault")
        try:
            cls._s3_client.head_bucket(Bucket=bucket)
        except ClientError as e:
            error_code = e.response.get("Error", {}).get("Code")
            if error_code in ("404", "NoSuchBucket"):
                try:
                    region = getattr(settings, "AWS_REGION", "us-east-1")
                    if region == "us-east-1":
                        cls._s3_client.create_bucket(Bucket=bucket)
                    else:
                        cls._s3_client.create_bucket(
                            Bucket=bucket,
                            CreateBucketConfiguration={"LocationConstraint": region},
                        )
                except Exception as ce:
                    print(f"Bucket auto-creation notice (will use existing): {ce}")
            else:
                print(f"S3 connection check: {e}")

        return cls._s3_client

    @staticmethod
    def _parse_s3_uri(s3_uri: str) -> Tuple[str, str]:
        """Parses s3://bucket-name/object-key into (bucket, key)."""
        match = re.match(r"^s3://([^/]+)/(.+)$", s3_uri)
        if not match:
            raise ValueError(f"Invalid S3 URI: {s3_uri}")
        return match.group(1), match.group(2)

    @classmethod
    def save_encrypted_object(cls, relative_filename: str, ciphertext: bytes) -> str:
        """
        Saves encrypted ciphertext into cloud object storage (S3) or private vault.
        Returns the persistent storage identifier (s3:// URI or local filesystem path).
        """
        if cls.is_s3_enabled():
            bucket = getattr(settings, "AWS_S3_BUCKET", "trustshare-encrypted-vault")
            key = f"encrypted_vault/{relative_filename}"
            s3 = cls.get_s3_client()
            s3.put_object(
                Bucket=bucket,
                Key=key,
                Body=ciphertext,
                ContentType="application/octet-stream",
                Metadata={
                    "encrypted": "true",
                    "algorithm": "AES-256-GCM",
                },
            )
            return f"s3://{bucket}/{key}"

        # Local private filesystem storage fallback
        cls.initialize()
        destination_path = os.path.join(cls.VAULT_DIR, relative_filename)
        with open(destination_path, "wb") as f:
            f.write(ciphertext)
        return destination_path

    @classmethod
    def get_encrypted_object(cls, storage_path: str) -> bytes:
        """
        Retrieves raw encrypted ciphertext from S3 or local private vault.
        """
        if storage_path.startswith("s3://"):
            bucket, key = cls._parse_s3_uri(storage_path)
            s3 = cls.get_s3_client()
            try:
                response = s3.get_object(Bucket=bucket, Key=key)
                return response["Body"].read()
            except ClientError as e:
                raise FileNotFoundError(f"S3 encrypted object not found at {storage_path}: {e}")

        # Local storage
        if not os.path.exists(storage_path):
            raise FileNotFoundError(f"Encrypted object not found at {storage_path}")
        with open(storage_path, "rb") as f:
            return f.read()

    @classmethod
    def exists(cls, storage_path: str) -> bool:
        """
        Checks whether the encrypted object exists in cloud storage or local vault.
        """
        if not storage_path:
            return False
        if storage_path.startswith("s3://"):
            try:
                bucket, key = cls._parse_s3_uri(storage_path)
                s3 = cls.get_s3_client()
                s3.head_object(Bucket=bucket, Key=key)
                return True
            except Exception:
                return False
        return os.path.exists(storage_path)

    @classmethod
    def delete_encrypted_object(cls, storage_path: str) -> bool:
        """
        Permanently removes the encrypted object from cloud storage or local vault.
        """
        if storage_path.startswith("s3://"):
            try:
                bucket, key = cls._parse_s3_uri(storage_path)
                s3 = cls.get_s3_client()
                s3.delete_object(Bucket=bucket, Key=key)
                return True
            except Exception as e:
                print(f"S3 deletion warning: {e}")
                return False

        if os.path.exists(storage_path):
            try:
                os.remove(storage_path)
                return True
            except OSError:
                return False
        return False
