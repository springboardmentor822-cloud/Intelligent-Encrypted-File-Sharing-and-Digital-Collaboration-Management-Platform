# Deploying TrustShare to AWS (Milestone 4)

Target: one EC2 server running Docker Compose behind nginx with HTTPS, files in a private S3 bucket and keys protected by AWS KMS.
The application supports AWS S3 for cloud storage (Azure Blob Storage is not implemented, so use AWS). Use a **fresh** database in
production: data keys wrapped with local keys can't be unwrapped by KMS, so don't switch key providers on a system that already has files.

## 1. Create the AWS resources
1. **S3 bucket:** name e.g. `trustshare-files-<yourname>`, region close to you (e.g. `ap-south-1`), **Block all public access = ON**, default encryption on.
2. **KMS key:** symmetric, encrypt/decrypt, alias `trustshare`. Copy its ARN.
3. **IAM role for EC2** (`trustshare-ec2-role`) with this policy (replace the names):
```json
{ "Version": "2012-10-17", "Statement": [
  { "Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": "arn:aws:s3:::trustshare-files-NAME" },
  { "Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], "Resource": "arn:aws:s3:::trustshare-files-NAME/*" },
  { "Effect": "Allow", "Action": ["kms:Encrypt", "kms:Decrypt"], "Resource": "KMS_KEY_ARN" } ] }
```
No access keys are needed: the server uses the role. Never put AWS keys in the code or in git.
4. **EC2:** Ubuntu 24.04, **t3.medium** (the web build needs memory), 30 GB disk, attach the role, security group allowing 22 (your IP only), 80 and 443. Attach an Elastic IP.

## 2. Prepare the server
```
sudo apt update && sudo apt install -y git
curl -fsSL https://get.docker.com | sudo sh && sudo usermod -aG docker $USER   # log out and back in
git clone https://github.com/<you>/trustshare.git && cd trustshare
python3 scripts/generate_env.py
```

## 3. Edit `.env` for production
```
ENVIRONMENT=production
FRONTEND_URL=https://YOUR-DOMAIN
BACKEND_PUBLIC_URL=https://YOUR-DOMAIN
CORS_ORIGINS=https://YOUR-DOMAIN
NEXT_PUBLIC_API_URL=/api/v1
STORAGE_BACKEND=s3
S3_ENDPOINT_URL=
S3_BUCKET=trustshare-files-NAME
S3_REGION=ap-south-1
S3_ACCESS_KEY=
S3_SECRET_KEY=
KEY_PROVIDER=aws_kms
KMS_KEY_ID=KMS_KEY_ARN
KMS_REGION=ap-south-1
SEED_DEMO_USERS=false
SMTP_HOST=...   # a real mail service (e.g. Amazon SES) so reset and alert emails are delivered
```

## 4. HTTPS
With a domain pointing at the Elastic IP: `sudo apt install -y certbot`, run `sudo certbot certonly --standalone -d YOUR-DOMAIN`,
then copy `fullchain.pem` and `privkey.pem` from `/etc/letsencrypt/live/YOUR-DOMAIN/` into `deploy/certs/`.
For a quick demo without a domain: `sh deploy/certs/generate-self-signed.sh` (browsers will show a warning).

## 5. Start
```
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
docker compose ps
```
Open `https://YOUR-DOMAIN`, sign in with the admin from `.env`, upload a file and check it appears in the S3 console as an unreadable object.
Run `py scripts/smoke_test.py https://YOUR-DOMAIN/api/v1` from your laptop.

## 6. Operate
Back up: the PostgreSQL and MongoDB volumes (`pg_dump`, `mongodump`, or EBS snapshots). Keep the KMS key: deleting it makes files unrecoverable.
Set an AWS billing alert. Stop the instance when not demonstrating to save cost. Update: `git pull` then rerun the `up -d --build` command.
