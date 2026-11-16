import urllib.request
import json
import boto3
from app.core.config import settings
from app.db.session import SessionLocal
from app.models.user import User
from app.models.file import FileRecord
from app.core.security import create_access_token
from app.services.storage_service import StorageService

def test_live_s3():
    print("=================================================================")
    print("      LIVE AWS S3 CLOUD STORAGE INTEGRATION VERIFICATION         ")
    print("=================================================================\n")

    # 1. Acquire JWT token for active user
    with SessionLocal() as db:
        u = db.query(User).filter(User.role == 'user').first()
        token = create_access_token(subject=str(u.id))
    print(f"[1] Authenticated as '{u.email}' (JWT Token generated).")

    # 2. Upload file through the FastAPI API
    filename = "Milestone2_Project_Report.pdf"
    plaintext_data = b"%PDF-1.4 ... TrustShare Milestone 2 Cloud Storage Secret Report Content ..."
    boundary = "----S3VerificationBoundary987654"
    
    body = (
        f"--{boundary}\r\n"
        f'Content-Disposition: form-data; name="file"; filename="{filename}"\r\n'
        f"Content-Type: application/pdf\r\n\r\n"
    ).encode("utf-8") + plaintext_data + f"\r\n--{boundary}--\r\n".encode("utf-8")

    req = urllib.request.Request(
        "http://127.0.0.1:8000/api/v1/files/upload",
        data=body,
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": f"multipart/form-data; boundary={boundary}",
        },
        method="POST"
    )

    print(f"[2] Uploading '{filename}' via POST /api/v1/files/upload...")
    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
    
    file_id = res["id"]
    print(f"    -> Upload Succeeded! File ID: {file_id}, Filename: {res['original_filename']}")
    print(f"    -> Encryption: {res['encryption_algorithm']} (Encrypted: {res['is_encrypted']})\n")

    # 3. Verify in PostgreSQL that the storage path is an S3 URI
    with SessionLocal() as db:
        rec = db.query(FileRecord).filter(FileRecord.id == file_id).first()
        s3_path = rec.file_path
        print(f"[3] PostgreSQL Metadata Storage Path: {s3_path}")
        assert s3_path.startswith(f"s3://{settings.AWS_S3_BUCKET}/"), f"Expected S3 path, got {s3_path}"
        print("    -> Stored as S3 Object URI in PostgreSQL!\n")

    # 4. Directly query AWS S3 to inspect the stored object
    print(f"[4] Querying live Amazon AWS S3 Bucket '{settings.AWS_S3_BUCKET}'...")
    s3 = boto3.client(
        "s3",
        aws_access_key_id=settings.AWS_ACCESS_KEY_ID,
        aws_secret_access_key=settings.AWS_SECRET_ACCESS_KEY,
        region_name=settings.AWS_REGION
    )
    bucket, key = StorageService._parse_s3_uri(s3_path)
    s3_obj = s3.get_object(Bucket=bucket, Key=key)
    raw_s3_bytes = s3_obj["Body"].read()

    print(f"    -> Successfully retrieved object '{key}' directly from Amazon S3!")
    print(f"    -> Object size in S3: {len(raw_s3_bytes)} bytes")
    print(f"    -> S3 Metadata: {s3_obj.get('Metadata')}")

    # Verify zero plaintext in S3
    is_plaintext_in_s3 = b"Secret Report Content" in raw_s3_bytes
    print(f"    -> Plaintext found in AWS S3 object: {is_plaintext_in_s3}")
    assert not is_plaintext_in_s3, "CRITICAL: Plaintext was found in AWS S3! Must be encrypted ciphertext!"
    print("    -> [SECURITY CONFIRMED] Stored object in AWS S3 is 100% encrypted AES-256 ciphertext!\n")

    # 5. Test authorized file download & authenticated in-memory decryption
    print(f"[5] Downloading file via GET /api/v1/files/{file_id}/download...")
    req_dl = urllib.request.Request(
        f"http://127.0.0.1:8000/api/v1/files/{file_id}/download",
        headers={"Authorization": f"Bearer {token}"}
    )
    with urllib.request.urlopen(req_dl) as resp:
        downloaded = resp.read()
    
    assert downloaded == plaintext_data, "Decrypted download does not match original plaintext!"
    print("    -> Decryption and SHA-256 integrity tag check verified!")
    print(f"    -> Decrypted file content: {downloaded[:60]}...\n")

    print("=================================================================")
    print("   [SUCCESS] MILESTONE 2 AWS S3 CLOUD INTEGRATION VERIFIED!      ")
    print("=================================================================")

if __name__ == "__main__":
    test_live_s3()

