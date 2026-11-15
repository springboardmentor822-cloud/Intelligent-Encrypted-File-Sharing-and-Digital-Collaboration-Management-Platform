# Using AWS S3 for encrypted storage (Milestone 2, Task 2)

The app already supports it: set `STORAGE_BACKEND=s3` and the values below in `.env`, then restart.
Only **encrypted bytes** are ever uploaded (`backend/app/core/storage.py`). S3 additionally encrypts them with its own
`AES256` (SSE-S3) as a second layer.

```env
STORAGE_BACKEND=s3
S3_BUCKET=your-bucket-name
S3_REGION=ap-south-1
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
```

## 1. Make the bucket private
S3 console → your bucket → **Permissions → Block public access → turn ALL four options ON**.
Do not add any public bucket policy. TrustShare downloads through the backend, so S3 never needs to be public.

## 2. Create a user that can only do what the app needs (least privilege)
IAM → Policies → Create policy → JSON (replace `your-bucket-name`):

```json
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Action": ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"],
    "Resource": "arn:aws:s3:::your-bucket-name/*"
  }]
}
```
Attach it to a new IAM user, create an access key, and put it in `.env`. Never commit `.env`.

## 3. Prove the object is unreadable (required by the milestone)
1. Upload `report.pdf` in the app.
2. S3 console → open the object (`<user-id>/<file-id>.enc`) → **Download**.
3. Try to open it: it is random-looking bytes, not a PDF. Or run `python scripts/verify_encryption.py` in `backend/`.

## Simplified vs production
| Student project | Production |
|---|---|
| Access key pair in `.env` | IAM **role** attached to the server (no keys at all) |
| SSE-S3 | SSE-KMS with your own key, bucket versioning, access logs, lifecycle rules |
