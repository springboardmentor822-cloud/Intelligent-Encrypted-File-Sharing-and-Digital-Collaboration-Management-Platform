#!/usr/bin/env python3
"""Create .env from .env.example with freshly generated secrets (never reuse these across environments)."""
import base64
import os
import secrets
import sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
target = root / ".env"
if target.exists() and "--force" not in sys.argv:
    sys.exit(".env already exists. Use --force to overwrite (this would invalidate existing encrypted files if you change MASTER_KEYS!).")

admin_password = secrets.token_urlsafe(12) + "A1"
values = {
    "POSTGRES_PASSWORD": secrets.token_urlsafe(24),
    "JWT_SECRET": secrets.token_urlsafe(48),
    "MASTER_KEYS": "1:" + base64.b64encode(os.urandom(32)).decode(),
    "S3_SECRET_KEY": secrets.token_urlsafe(24),
    "ADMIN_PASSWORD": admin_password,
}
out = []
for line in (root / ".env.example").read_text().splitlines():
    key = line.split("=", 1)[0]
    if key in values and "CHANGE_ME" in line:
        line = f"{key}={values[key]}"
    out.append(line)
target.write_text("\n".join(out) + "\n")
os.chmod(target, 0o600)
print(f"Created {target}\n  Admin login: admin@trustshare.local / {admin_password}")
print("  BACK UP the MASTER_KEYS value somewhere safe: without it, encrypted files cannot be decrypted.")
