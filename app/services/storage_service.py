import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.config import (
    RUSTFS_ENDPOINT_URL,
    RUSTFS_ACCESS_KEY,
    RUSTFS_SECRET_KEY,
    RUSTFS_BUCKET_NAME,
    RUSTFS_REGION,
)


class StorageService:

    @staticmethod
    def get_client():
        if not RUSTFS_ACCESS_KEY or not RUSTFS_SECRET_KEY:
            raise RuntimeError("RustFS credentials are not configured.")

        return boto3.client(
            "s3",
            endpoint_url=RUSTFS_ENDPOINT_URL,
            aws_access_key_id=RUSTFS_ACCESS_KEY,
            aws_secret_access_key=RUSTFS_SECRET_KEY,
            region_name=RUSTFS_REGION,
            config=Config(
                signature_version="s3v4",
                s3={"addressing_style": "path"},
            ),
        )

    @staticmethod
    def ensure_bucket():
        client = StorageService.get_client()

        try:
            client.head_bucket(Bucket=RUSTFS_BUCKET_NAME)
        except ClientError as exc:
            error_code = exc.response.get("Error", {}).get("Code", "")

            if error_code not in ("404", "NoSuchBucket"):
                raise

            client.create_bucket(Bucket=RUSTFS_BUCKET_NAME)

        return RUSTFS_BUCKET_NAME

    @staticmethod
    def upload_file(object_key: str, file_data: bytes):
        client = StorageService.get_client()

        client.put_object(
            Bucket=RUSTFS_BUCKET_NAME,
            Key=object_key,
            Body=file_data,
        )

        return object_key

    @staticmethod
    def download_file(object_key: str) -> bytes:
        client = StorageService.get_client()

        response = client.get_object(
            Bucket=RUSTFS_BUCKET_NAME,
            Key=object_key,
        )

        return response["Body"].read()

    @staticmethod
    def delete_file(object_key: str):
        client = StorageService.get_client()

        client.delete_object(
            Bucket=RUSTFS_BUCKET_NAME,
            Key=object_key,
        )
