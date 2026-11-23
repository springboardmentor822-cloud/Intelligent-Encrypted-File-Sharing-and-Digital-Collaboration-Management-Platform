from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal
from urllib.parse import quote
import hashlib
import secrets
import psutil
import os
import smtplib
from email.message import EmailMessage

import jwt
import psycopg
from psycopg.errors import UniqueViolation

from fastapi import (
    FastAPI,
    HTTPException,
    Request,
    UploadFile,
    File,
    Depends,
    Query,
    Header,
)
from fastapi.responses import FileResponse, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr, Field
from pwdlib import PasswordHash
from dotenv import load_dotenv

from supabase_client import supabase
from encryption_service import (
    generate_key,
    encrypt_file,
    decrypt_file,
    wrap_file_key,
    unwrap_file_key,
)




# ---------------- CONFIGURATION ----------------

ADMIN_EMAIL = "sireeshakottavalasa2@gmail.com".lower().strip()
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="TrustShare API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:5174",
        "http://127.0.0.1:5174",
        "http://localhost:5175",
        "http://127.0.0.1:5175",
        "https://intelligent-encrypted-file-sharing-and-ka8p.onrender.com",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load environment variables from .env
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
SECRET_KEY = os.getenv("SECRET_KEY")

if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is missing in environment variables")

if not SECRET_KEY:
    raise RuntimeError("SECRET_KEY is missing in environment variables")

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

password_hash = PasswordHash.recommended()
security = HTTPBearer(auto_error=False)


# ---------------- DATABASE HELPER ----------------

def get_db_connection():
    return psycopg.connect(DATABASE_URL, connect_timeout=5)


# ---------------- SECURITY EVENT LOGGING ----------------

def log_security_event(
    event_type: str,
    actor_email: str | None = None,
    details: str | None = None,
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO security_events
                        (event_type, actor_email, details)
                    VALUES (%s, %s, %s)
                    """,
                    (event_type, actor_email, details),
                )
    except Exception as e:
        print("Security event logging error:", repr(e))


 # ---------------- ACTIVITY MONITORING ----------------

def log_activity(
    activity_type: str,
    status: str,
    user_email: str | None = None,
    file_id: int | None = None,
    ip_address: str | None = None,
):
    try:
        user_id = None

        if user_email:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id
                        FROM users
                        WHERE LOWER(email) = LOWER(%s)
                        """,
                        (user_email,),
                    )
                    result = cur.fetchone()

                    if result:
                        user_id = result[0]

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO activity_logs
                    (user_id, activity_type, file_id, status, ip_address)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        activity_type,
                        file_id,
                        status,
                        ip_address,
                    ),
                )

    except Exception as e:
        print("Activity logging error:", repr(e))    

# ---------------- AUDIT LOGGING ----------------

def log_audit_event(
    user_email: str | None = None,
    activity_type: str = "UNKNOWN",
    file_id: int | None = None,
    description: str | None = None,
    status: str = "SUCCESS",
    ip_address: str | None = None,
):
    try:
        user_id = None
        username = None

        if user_email:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT id, full_name
                        FROM users
                        WHERE LOWER(email) = LOWER(%s)
                        """,
                        (user_email,),
                    )
                    result = cur.fetchone()

                    if result:
                        user_id = result[0]
                        username = result[1]

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO audit_logs
                    (
                        user_id,
                        username,
                        activity_type,
                        file_id,
                        activity_description,
                        activity_status,
                        ip_address
                    )
                    VALUES (%s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        username,
                        activity_type,
                        file_id,
                        description,
                        status,
                        ip_address,
                    ),
                )

    except Exception as e:
        print("Audit logging error:", repr(e)) 


# ---------------- NOTIFICATIONS ----------------

def create_notification(
    user_email: str,
    title: str,
    message: str,
    notification_type: str,
    related_file_id: int | None = None,
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT id
                    FROM users
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (user_email,),
                )

                user = cur.fetchone()

                if not user:
                    print("Notification user not found:", user_email)
                    return

                user_id = user[0]

                cur.execute(
                    """
                    INSERT INTO notifications
                    (user_id, title, message, notification_type, related_file_id)
                    VALUES (%s, %s, %s, %s, %s)
                    """,
                    (
                        user_id,
                        title,
                        message,
                        notification_type,
                        related_file_id,
                    ),
                )

        send_email_notification(
            recipient_email=user_email,
            subject=title,
            body=message,
        )

    except Exception as e:
        print("Notification creation error:", repr(e))  


def send_email_notification(
    recipient_email: str,
    subject: str,
    body: str,
):
    try:
        smtp_email = os.getenv("SMTP_EMAIL")
        smtp_password = os.getenv("SMTP_PASSWORD")
        smtp_server = os.getenv("SMTP_SERVER", "smtp.gmail.com")
        smtp_port = int(os.getenv("SMTP_PORT", "587"))

        if not smtp_email or not smtp_password:
            print("SMTP credentials are missing in .env")
            return False

        email = EmailMessage()
        email["From"] = smtp_email
        email["To"] = recipient_email
        email["Subject"] = subject
        email.set_content(body)

        with smtplib.SMTP(smtp_server, smtp_port) as server:
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.send_message(email)

        print("Email notification sent to:", recipient_email)
        return True

    except Exception as e:
        print("Email notification error:", repr(e))
        return False



# ---------------- AUTHENTICATION ----------------

def decode_access_token(token: str) -> str:
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
        )

        email = payload.get("sub")

        if not email:
            raise HTTPException(
                status_code=401,
                detail="Invalid authentication token",
            )

        return email

    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired token. Please log in again.",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Bearer token required",
        )

    try:
        return decode_access_token(credentials.credentials)

    except HTTPException:
        log_security_event(
            "AUTH_FAILED",
            None,
            "Invalid or expired authentication token",
        )
        raise


# ---------------- ADMIN AUTHORIZATION ----------------

def require_admin(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT role
                    FROM users
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (current_user,),
                )
                result = cur.fetchone()

        if result is None or result[0] != "admin":
            log_security_event(
                "ADMIN_ACCESS_DENIED",
                current_user,
                "Attempted to access an admin-only endpoint",
            )

            raise HTTPException(
                status_code=403,
                detail="Admin access required",
            )

        return current_user

    except HTTPException:
        raise

    except Exception as e:
        print("Admin authorization error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to verify admin permissions",
        )


# ---------------- REQUEST MODELS ----------------

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    full_name: str | None = None


class UserLogin(BaseModel):
    email: EmailStr
    password: str

class AdminPasswordChange(BaseModel):
    current_password: str
    new_password: str


class ShareRequest(BaseModel):
    permission: Literal["view", "download"] = "view"
    expires_in_hours: int = Field(default=24, ge=1, le=720)
    recipient_email: EmailStr | None = None


# ---------------- HOME AND HEALTH ----------------

@app.get("/")
def home():
    return {
        "message": "Welcome to TrustShare!",
        "status": "Backend is running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}

@app.post("/admin/change-password")
def admin_change_password(
    request: AdminPasswordChange,
    admin_email: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT password_hash
                    FROM users
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (admin_email,),
                )
                result = cur.fetchone()

                if result is None or not password_hash.verify(
                    request.current_password, result[0]
                ):
                    raise HTTPException(
                        status_code=400,
                        detail="Current password is incorrect",
                    )

                if len(request.new_password) < 8:
                    raise HTTPException(
                        status_code=400,
                        detail="New password must contain at least 8 characters",
                    )

                new_hash = password_hash.hash(request.new_password)

                cur.execute(
                    """
                    UPDATE users
                    SET password_hash = %s
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (new_hash, admin_email),
                )

        log_security_event(
            "ADMIN_PASSWORD_CHANGED",
            admin_email,
            "Administrator password changed successfully",
        )

        return {
            "message": "Password changed successfully. Please log in again."
        }

    except HTTPException:
        raise
    except Exception as e:
        print("Admin password change error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to change administrator password",
        )


# ---------------- USER REGISTRATION ----------------

@app.post("/register")
def register(user: UserRegister):
    email = str(user.email).lower().strip()

    if len(user.password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters",
        )

    full_name = (
        user.full_name.strip()
        if user.full_name and user.full_name.strip()
        else email.split("@")[0]
    )

    hashed_password = password_hash.hash(user.password)

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    INSERT INTO users
                        (full_name, email, password_hash)
                    VALUES (%s, %s, %s)
                    """,
                    (full_name, email, hashed_password),
                )

        log_security_event(
            "USER_REGISTERED",
            email,
            "New user registered",
        )

        return {"message": "Registration successful"}

    except UniqueViolation:
        log_security_event(
            "REGISTRATION_FAILED",
            email,
            "Email is already registered",
        )

        raise HTTPException(
            status_code=400,
            detail="Email is already registered",
        )

    except Exception as e:
        print("Registration error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Registration failed. Check the backend terminal.",
        )


# ---------------- USER LOGIN ----------------

@app.post("/login")
def login(user: UserLogin, request: Request):
    email = str(user.email).lower().strip()

    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT password_hash,role
                    FROM users
                    WHERE LOWER(email) = LOWER(%s)
                    """,
                    (email,),
                )
                result = cur.fetchone()

    except Exception as e:
        print("Login database error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to access the database",
        )

    if result is None or not password_hash.verify(
        user.password,
        result[0],
    ):
        log_security_event(
            "LOGIN_FAILED",
            email,
            "Invalid email or password",
        )

        log_activity(
            activity_type="LOGIN",
            status="FAILED",
            user_email=email,
            ip_address=request.client.host if request.client else None,
        )

        log_audit_event(
            user_email=email,
            activity_type="LOGIN",
            description="Failed login attempt",
            status="FAILED",
            ip_address=request.client.host if request.client else None,
        )



        create_notification(
            user_email=ADMIN_EMAIL,
            title="Security Alert: Failed Login",
            message=f"Failed login attempt detected for {email}.",
            notification_type="SECURITY_ALERT",
        )


        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )
    user_role = result[1]
    print("LOGIN ROLE:", user_role)

    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=ACCESS_TOKEN_EXPIRE_MINUTES
    )

    token = jwt.encode(
        {
            "sub": email,
            "role": user_role,
            "exp": expires_at,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )

    log_security_event(
        "LOGIN_SUCCESS",
        email,
        "User logged in successfully",
    )

    log_activity(
    activity_type="LOGIN",
    status="SUCCESS",
    user_email=email,
    ip_address=request.client.host if request.client else None,
)

    log_audit_event(
        user_email=email,
        activity_type="LOGIN",
        description="User logged in successfully",
        status="SUCCESS",
        ip_address=request.client.host if request.client else None,
    )


    return {
        "message": "Login successful",
        "access_token": token,
        "token_type": "bearer",
        "role": user_role,
    }


# ---------------- ENCRYPTED CLOUD FILE UPLOAD ----------------

@app.post("/upload")
async def upload_file(
    request: Request,
    file: UploadFile = File(...),
    current_user: str = Depends(get_current_user),
):
    allowed_extensions = {
        ".pdf",
        ".png",
        ".jpg",
        ".jpeg",
        ".txt",
        ".csv",
    }

    max_size = 5 * 1024 * 1024

    original_name = Path(file.filename or "file").name
    extension = Path(original_name).suffix.lower()

    if extension not in allowed_extensions:
        await file.close()

        raise HTTPException(
            status_code=400,
            detail="File type not allowed",
        )

    try:
        content = await file.read(max_size + 1)

        if not content:
            raise HTTPException(
                status_code=400,
                detail="File is empty",
            )

        if len(content) > max_size:
            raise HTTPException(
                status_code=413,
                detail="File size must not exceed 5 MB",
            )

        stored_name = f"{secrets.token_hex(16)}{extension}"
        storage_path = f"users/{secrets.token_hex(16)}/{stored_name}"

        file_key = generate_key()

        file_nonce, encrypted_content = encrypt_file(
            content,
            file_key,
        )

        encrypted_blob = file_nonce + encrypted_content

        wrapped_key_nonce, wrapped_file_key = wrap_file_key(
            file_key
        )

        # Upload encrypted bytes to the private Supabase bucket.
        supabase.storage.from_("TrustShare-Files").upload(
            path=storage_path,
            file=encrypted_blob,
            file_options={
                "content-type": "application/octet-stream",
                "upsert": "false",
            },
        )

        try:
            with get_db_connection() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        INSERT INTO files (
                            owner_id,
                            original_name,
                            stored_name,
                            file_size,
                            content_type,
                            storage_path,
                            wrapped_key_nonce,
                            wrapped_file_key
                        )
                        SELECT
                            id, %s, %s, %s, %s, %s, %s, %s
                        FROM users
                        WHERE LOWER(email) = LOWER(%s)
                        RETURNING id
                        """,
                        (
                            original_name,
                            stored_name,
                            len(content),
                            file.content_type,
                            storage_path,
                            wrapped_key_nonce,
                            wrapped_file_key,
                            current_user,
                        ),
                    )

                    result = cur.fetchone()

                    if result is None:
                        raise HTTPException(
                            status_code=401,
                            detail="User account not found",
                        )

                    file_id = result[0]

        except Exception:
            try:
                supabase.storage.from_("TrustShare-Files").remove(
                    [storage_path]
                )
            except Exception as cleanup_error:
                print("Cloud cleanup error:", repr(cleanup_error))

            raise

        log_security_event(
            "FILE_UPLOAD_SUCCESS",
            current_user,
            f"Encrypted cloud upload: file ID {file_id}",
        )

        log_activity(
            activity_type="UPLOAD",
            status="SUCCESS",
            user_email=current_user,
            file_id=file_id,
            ip_address=request.client.host if request.client else None,
        )

        log_audit_event(
            user_email=current_user,
            activity_type="UPLOAD",
            file_id=file_id,
            description=f"File uploaded: {original_name}",
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
        )

        return {
            "message": "File encrypted and uploaded successfully",
            "file_id": file_id,
            "original_name": original_name,
            "file_size": len(content),
            "uploaded_by": current_user,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Encrypted upload error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Encrypted upload failed. Check the backend terminal.",
        )

    finally:
        await file.close()


# ---------------- LIST MY FILES ----------------

@app.get("/files")
def list_files(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        f.id,
                        f.original_name,
                        f.file_size,
                        f.content_type,
                        f.created_at
                    FROM files AS f
                    JOIN users AS u ON u.id = f.owner_id
                    WHERE LOWER(u.email) = LOWER(%s)
                    ORDER BY f.created_at DESC
                    """,
                    (current_user,),
                )

                rows = cur.fetchall()

        return {
            "files": [
                {
                    "id": row[0],
                    "original_name": row[1],
                    "file_size": row[2],
                    "content_type": row[3],
                    "created_at": (
                        row[4].isoformat() if row[4] else None
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("List files error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve files",
        )


# ---------------- DECRYPT CLOUD FILE HELPER ----------------

def fetch_decrypted_cloud_file(
    storage_path,
    wrapped_key_nonce,
    wrapped_file_key,
):
    if not wrapped_key_nonce or not wrapped_file_key:
        raise HTTPException(
            status_code=500,
            detail="Encryption metadata is missing",
        )

    encrypted_blob = (
        supabase.storage
        .from_("TrustShare-Files")
        .download(storage_path)
    )

    if len(encrypted_blob) < 12:
        raise HTTPException(
            status_code=500,
            detail="Encrypted file data is invalid",
        )

    file_nonce = encrypted_blob[:12]
    encrypted_content = encrypted_blob[12:]

    file_key = unwrap_file_key(
        bytes(wrapped_key_nonce),
        bytes(wrapped_file_key),
    )

    return decrypt_file(
        file_nonce,
        encrypted_content,
        file_key,
    )


# ---------------- SECURE FILE DOWNLOAD ----------------

@app.get("/files/{file_id}/download")
def download_file(
    request: Request,
    file_id: int,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        f.original_name,
                        f.stored_name,
                        f.content_type,
                        f.storage_path,
                        f.wrapped_key_nonce,
                        f.wrapped_file_key
                    FROM files AS f
                    JOIN users AS u ON u.id = f.owner_id
                    WHERE f.id = %s
                      AND LOWER(u.email) = LOWER(%s)
                    """,
                    (file_id, current_user),
                )

                result = cur.fetchone()

        if result is None:
            log_security_event(
                "FILE_DOWNLOAD_DENIED",
                current_user,
                f"File ID {file_id} not found for this user",
            )

            raise HTTPException(
                status_code=404,
                detail="File not found",
            )

        (
            original_name,
            stored_name,
            content_type,
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        ) = result

        # Support older files stored locally.
        if not storage_path:
            file_path = UPLOAD_DIR / stored_name

            if not file_path.is_file():
                raise HTTPException(
                    status_code=404,
                    detail="Stored file not found",
                )

            return FileResponse(
                path=str(file_path),
                filename=original_name,
                media_type=content_type or "application/octet-stream",
            )

        decrypted_content = fetch_decrypted_cloud_file(
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        )

        log_security_event(
            "FILE_DOWNLOAD_SUCCESS",
            current_user,
            f"Downloaded and decrypted cloud file ID {file_id}",
        )

        log_activity(
            activity_type="DOWNLOAD",
            status="SUCCESS",
            user_email=current_user,
            file_id=file_id,
            ip_address=request.client.host if request.client else None,
        )

        log_audit_event(
            user_email=current_user,
            activity_type="DOWNLOAD",
            file_id=file_id,
            description=f"File downloaded: {original_name}",
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
        )

        safe_filename = quote(original_name, safe="")

        return Response(
            content=decrypted_content,
            media_type=content_type or "application/octet-stream",
            headers={
                "Content-Disposition": (
                    f"attachment; filename*=UTF-8''{safe_filename}"
                )
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print("Secure download error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to download and decrypt file",
        )
        
# ---------------- DELETE MY FILE ----------------

@app.delete("/files/{file_id}")
def delete_file(
    file_id: int,
    current_user: str = Depends(get_current_user),
):
    try:
        # First verify that the file belongs to the logged-in user.
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        f.id,
                        f.storage_path,
                        f.stored_name,
                        f.original_name
                    FROM files AS f
                    JOIN users AS u ON u.id = f.owner_id
                    WHERE f.id = %s
                      AND LOWER(u.email) = LOWER(%s)
                    """,
                    (file_id, current_user),
                )

                file_row = cur.fetchone()

                if file_row is None:
                    raise HTTPException(
                        status_code=404,
                        detail="File not found",
                    )

                storage_path = file_row[1]
                stored_name = file_row[2]
                original_name = file_row[3]

                # Delete related share records first.
                cur.execute(
                    """
                    DELETE FROM file_shares
                    WHERE file_id = %s
                    """,
                    (file_id,),
                )

                # Delete the file record.
                cur.execute(
                    """
                    DELETE FROM files
                    WHERE id = %s
                    """,
                    (file_id,),
                )

        # Remove encrypted file from Supabase Storage.
        if storage_path:
            try:
                supabase.storage.from_("TrustShare-Files").remove(
                    [storage_path]
                )
            except Exception as storage_error:
                print(
                    "Supabase file cleanup error:",
                    repr(storage_error),
                )

        # Remove legacy local file, if present.
        elif stored_name:
            local_path = UPLOAD_DIR / stored_name

            if local_path.is_file():
                local_path.unlink()

        log_security_event(
            "FILE_DELETE_SUCCESS",
            current_user,
            f"Deleted file ID {file_id}: {original_name}",
        )

        return {
            "message": "File deleted successfully",
            "file_id": file_id,
            "original_name": original_name,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("File deletion error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to delete file",
        )



# ---------------- CREATE SECURE SHARE LINK ----------------

@app.post("/files/{file_id}/share")
def create_share(
    file_id: int,
    http_request: Request,
    request: ShareRequest,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT f.id, f.owner_id
                    FROM files AS f
                    JOIN users AS u ON u.id = f.owner_id
                    WHERE f.id = %s
                      AND LOWER(u.email) = LOWER(%s)
                    """,
                    (file_id, current_user),
                )

                file_row = cur.fetchone()

                if file_row is None:
                    raise HTTPException(
                        status_code=404,
                        detail="File not found",
                    )

                raw_token = secrets.token_urlsafe(32)

                token_hash = hashlib.sha256(
                    raw_token.encode("utf-8")
                ).hexdigest()

                expires_at = (
                    datetime.now(timezone.utc)
                    + timedelta(hours=request.expires_in_hours)
                )

                recipient_email = (
                    str(request.recipient_email).lower().strip()
                    if request.recipient_email
                    else None
                )

                cur.execute(
                    """
                    INSERT INTO file_shares (
                        file_id,
                        owner_id,
                        recipient_email,
                        share_token_hash,
                        permission,
                        expires_at
                    )
                    VALUES (%s, %s, %s, %s, %s, %s)
                    RETURNING id, expires_at
                    """,
                    (
                        file_id,
                        file_row[1],
                        recipient_email,
                        token_hash,
                        request.permission,
                        expires_at,
                    ),
                )

                share_row = cur.fetchone()

        log_security_event(
            "FILE_SHARE_CREATED",
            current_user,
            f"Created share ID {share_row[0]} for file ID {file_id}",
        )
        log_activity(
            activity_type="SHARE",
            status="SUCCESS",
            user_email=current_user,
            file_id=file_id,
            ip_address=http_request.client.host if http_request.client else None,
        )
        
        log_audit_event(
            user_email=current_user,
            activity_type="SHARE",
            file_id=file_id,
            description=f"Created share ID {share_row[0]} for file ID {file_id}",
            status="SUCCESS",
            ip_address=http_request.client.host if http_request.client else None,
        )

        if recipient_email:
            create_notification(
            user_email=recipient_email,
            title="New File Shared With You",
            message=f"{current_user} shared a file with you.",
            notification_type="FILE_SHARED",
            related_file_id=file_id,
        )

        return {
            "message": "Share created successfully",
            "share_id": share_row[0],
            "share_token": raw_token,
            "permission": request.permission,
            "recipient_email": recipient_email,
            "expires_at": share_row[1].isoformat(),
            "note": "Save the token now. Only its hash is stored.",
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Create share error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to create share",
        )


# ---------------- LIST SHARES FOR A FILE ----------------

@app.get("/files/{file_id}/shares")
def list_file_shares(
    file_id: int,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.id,
                        fs.permission,
                        fs.recipient_email,
                        fs.created_at,
                        fs.expires_at,
                        fs.revoked_at
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    JOIN users AS u ON u.id = f.owner_id
                    WHERE fs.file_id = %s
                      AND LOWER(u.email) = LOWER(%s)
                    ORDER BY fs.created_at DESC
                    """,
                    (file_id, current_user),
                )

                rows = cur.fetchall()

        now = datetime.now(timezone.utc)

        return {
            "shares": [
                {
                    "share_id": row[0],
                    "permission": row[1],
                    "recipient_email": row[2],
                    "created_at": (
                        row[3].isoformat() if row[3] else None
                    ),
                    "expires_at": (
                        row[4].isoformat() if row[4] else None
                    ),
                    "revoked_at": (
                        row[5].isoformat() if row[5] else None
                    ),
                    "active": (
                        row[5] is None
                        and (row[4] is None or row[4] > now)
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("List shares error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to list shares",
        )
        
# ---------------- LIST FILES SHARED WITH ME ----------------

@app.get("/shared-with-me")
def list_shared_with_me(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.id,
                        fs.file_id,
                        f.original_name,
                        f.file_size,
                        f.content_type,
                        owner.email,
                        fs.permission,
                        fs.created_at,
                        fs.expires_at,
                        fs.revoked_at
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    JOIN users AS owner ON owner.id = fs.owner_id
                    WHERE LOWER(fs.recipient_email) = LOWER(%s)
                    ORDER BY fs.created_at DESC
                    """,
                    (current_user,),
                )

                rows = cur.fetchall()

        now = datetime.now(timezone.utc)

        return {
            "shared_files": [
                {
                    "share_id": row[0],
                    "file_id": row[1],
                    "file_name": row[2],
                    "file_size": row[3],
                    "content_type": row[4],
                    "shared_by": row[5],
                    "permission": row[6],
                    "shared_at": (
                        row[7].isoformat() if row[7] else None
                    ),
                    "expires_at": (
                        row[8].isoformat() if row[8] else None
                    ),
                    "active": (
                        row[9] is None
                        and (row[8] is None or row[8] > now)
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Shared with me error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve shared files",
        )


 
# ---------------- VIEW SHARED FILE FROM DASHBOARD ----------------

@app.get("/shared-with-me/{share_id}/view")
def view_shared_file(
    share_id: int,
    request: Request,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.file_id,
                        fs.permission,
                        fs.expires_at,
                        fs.revoked_at,
                        f.original_name,
                        f.content_type,
                        f.storage_path,
                        f.wrapped_key_nonce,
                        f.wrapped_file_key
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    WHERE fs.id = %s
                      AND LOWER(fs.recipient_email) = LOWER(%s)
                    """,
                    (share_id, current_user),
                )
                row = cur.fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Shared file not found",
            )

        (
            file_id,
            permission,
            expires_at,
            revoked_at,
            original_name,
            content_type,
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        ) = row

        now = datetime.now(timezone.utc)

        if revoked_at is not None:
            raise HTTPException(
                status_code=410,
                detail="This share has been revoked",
            )

        if expires_at is not None and expires_at <= now:
            raise HTTPException(
                status_code=410,
                detail="This share has expired",
            )

        if permission != "view":
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to view this file",
            )

        if content_type != "application/pdf":
            raise HTTPException(
                status_code=400,
                detail="Preview is currently available for PDF files only",
            )

        if not storage_path:
            raise HTTPException(
                status_code=410,
                detail="File is not available in cloud storage",
            )

        decrypted_content = fetch_decrypted_cloud_file(
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        )

        log_security_event(
            "FILE_SHARE_VIEWED",
            current_user,
            f"Viewed shared PDF, share ID {share_id}",
        )

        log_activity(
            activity_type="FILE_ACCESS",
            status="SUCCESS",
            user_email=current_user,
            file_id=file_id,
            ip_address=request.client.host if request.client else None,
        )

        log_audit_event(
            user_email=current_user,
            activity_type="FILE_ACCESS",
            file_id=file_id,
            description=f"Viewed shared PDF, share ID {share_id}",
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
        )

        safe_filename = quote(original_name, safe="")

        return Response(
            content=decrypted_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f"inline; filename*=UTF-8''{safe_filename}"
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print("Shared file preview error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to preview shared file",
        )

# ---------------- DOWNLOAD FILE SHARED WITH ME ----------------

@app.get("/shared-with-me/{share_id}/download")
def download_file_shared_with_me(
    share_id: int,
    request: Request,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.file_id,
                        fs.permission,
                        fs.expires_at,
                        fs.revoked_at,
                        f.original_name,
                        f.content_type,
                        f.storage_path,
                        f.wrapped_key_nonce,
                        f.wrapped_file_key,
                        owner.email
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    JOIN users AS owner ON owner.id = fs.owner_id
                    WHERE fs.id = %s
                      AND LOWER(fs.recipient_email) = LOWER(%s)
                    """,
                    (share_id, current_user),
                )
                row = cur.fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Shared file not found",
            )

        (
            file_id,
            permission,
            expires_at,
            revoked_at,
            original_name,
            content_type,
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
            owner_email,
        ) = row

        now = datetime.now(timezone.utc)

        if revoked_at is not None:
            raise HTTPException(
                status_code=410,
                detail="This share has been revoked",
            )

        if expires_at is not None and expires_at <= now:
            raise HTTPException(
                status_code=410,
                detail="This share has expired",
            )

        if permission != "download":
            raise HTTPException(
                status_code=403,
                detail="You do not have permission to download this file",
            )

        if not storage_path:
            raise HTTPException(
                status_code=410,
                detail="File is not available in cloud storage",
            )

        decrypted_content = fetch_decrypted_cloud_file(
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        )

        log_security_event(
            "FILE_SHARE_DOWNLOADED",
            current_user,
            f"Downloaded shared file, share ID {share_id}",
        )

        log_activity(
            activity_type="DOWNLOAD",
            status="SUCCESS",
            user_email=current_user,
            file_id=file_id,
            ip_address=request.client.host if request.client else None,
        )

        log_audit_event(
            user_email=current_user,
            activity_type="SHARED_FILE_DOWNLOAD",
            file_id=file_id,
            description=f"Downloaded shared file: {original_name} (Share ID: {share_id})",
            status="SUCCESS",
            ip_address=request.client.host if request.client else None,
        )

        create_notification(
            user_email=owner_email,
            title="File Downloaded",
            message=f"{current_user} downloaded your shared file.",
            notification_type="FILE_DOWNLOADED",
            related_file_id=file_id,
        )

        safe_filename = quote(original_name, safe="")

        return Response(
            content=decrypted_content,
            media_type=content_type or "application/octet-stream",
            headers={
                "Content-Disposition": (
                    f"attachment; filename*=UTF-8''{safe_filename}"
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print("Shared file download error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to download shared file",
        )
       
        
# ---------------- LIST FILES SHARED BY ME ----------------

@app.get("/shared-by-me")
def list_shared_by_me(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.id,
                        fs.file_id,
                        f.original_name,
                        f.file_size,
                        f.content_type,
                        fs.recipient_email,
                        fs.permission,
                        fs.created_at,
                        fs.expires_at,
                        fs.revoked_at
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    JOIN users AS owner ON owner.id = fs.owner_id
                    WHERE LOWER(owner.email) = LOWER(%s)
                    ORDER BY fs.created_at DESC
                    """,
                    (current_user,),
                )

                rows = cur.fetchall()

        now = datetime.now(timezone.utc)

        return {
            "shared_files": [
                {
                    "share_id": row[0],
                    "file_id": row[1],
                    "file_name": row[2],
                    "file_size": row[3],
                    "content_type": row[4],
                    "shared_with": row[5],
                    "permission": row[6],
                    "shared_at": (
                        row[7].isoformat() if row[7] else None
                    ),
                    "expires_at": (
                        row[8].isoformat() if row[8] else None
                    ),
                    "revoked_at": (
                        row[9].isoformat() if row[9] else None
                    ),
                    "active": (
                        row[9] is None
                        and (row[8] is None or row[8] > now)
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Shared by me error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve shared files",
        )




# ---------------- REVOKE SHARE LINK ----------------

@app.delete("/shares/{share_id}")
def revoke_share(
    share_id: int,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE file_shares AS fs
                    SET revoked_at = NOW()
                    FROM users AS u
                    WHERE fs.id = %s
                      AND fs.owner_id = u.id
                      AND LOWER(u.email) = LOWER(%s)
                      AND fs.revoked_at IS NULL
                    RETURNING fs.file_id
                    """,
                    (share_id, current_user),
                )

                row = cur.fetchone()

        if row is None:
            raise HTTPException(
                status_code=404,
                detail="Active share not found for this user",
            )

        log_security_event(
            "FILE_SHARE_REVOKED",
            current_user,
            f"Revoked share ID {share_id}",
        )

        log_audit_event(
            user_email=current_user,
            activity_type="SHARE_REVOKED",
            description=f"Revoked share ID {share_id}",
            status="SUCCESS",
        )

        return {
            "message": "Share link revoked successfully",
            "share_id": share_id,
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Revoke share error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to revoke share",
        )



# ---------------- SHARED FILE ACCESS HELPER ----------------

def get_valid_share(token: str, authorization: str | None = None):
    token_hash = hashlib.sha256(
        token.encode("utf-8")
    ).hexdigest()

    with get_db_connection() as conn:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    fs.id,
                    fs.permission,
                    fs.recipient_email,
                    u.email AS owner_email,
                    fs.expires_at,
                    fs.revoked_at,
                    f.original_name,
                    f.content_type,
                    f.storage_path,
                    f.stored_name,
                    f.wrapped_key_nonce,
                    f.wrapped_file_key
                FROM file_shares AS fs
                JOIN files AS f ON f.id = fs.file_id
                JOIN users AS u ON u.id = f.owner_id
                WHERE fs.share_token_hash = %s
                """,
                (token_hash,),
            )
            row = cur.fetchone()

    if row is None:
        log_security_event(
            "FILE_SHARE_ACCESS_DENIED",
            None,
            "Unknown share token",
        )
        raise HTTPException(
            status_code=404,
            detail="Share link not found",
        )

    (
        share_id,
        permission,
        recipient_email,
        owner_email,
        expires_at,
        revoked_at,
        original_name,
        content_type,
        storage_path,
        stored_name,
        wrapped_key_nonce,
        wrapped_file_key,
    ) = row

    now = datetime.now(timezone.utc)

    if revoked_at is not None:
        raise HTTPException(
            status_code=410,
            detail="Share link has been revoked",
        )

    if expires_at is not None and expires_at <= now:
        raise HTTPException(
            status_code=410,
            detail="Share link has expired",
        )

    # Check login for email-restricted links.
    if recipient_email:
        if (
            not authorization
            or not authorization.lower().startswith("bearer ")
        ):
            raise HTTPException(
                status_code=401,
                detail="Log in with the invited email to access this link",
            )

        viewer_email = decode_access_token(
            authorization.split(" ", 1)[1].strip()
        )

        if viewer_email.lower() != recipient_email.lower():
            log_security_event(
                "FILE_SHARE_ACCESS_DENIED",
                viewer_email,
                f"Email mismatch for share ID {share_id}",
            )
            raise HTTPException(
                status_code=403,
                detail="This share link is restricted to another email address",
            )

    if not storage_path:
        raise HTTPException(
            status_code=410,
            detail="This legacy file is not available through shared links",
        )

    return (
        share_id,
        permission,
        recipient_email,
        original_name,
        content_type,
        storage_path,
        wrapped_key_nonce,
        wrapped_file_key,
    )


# ---------------- VIEW A SHARED PDF ----------------

@app.get("/share/{token}")
def access_shared_file(
    token: str,
    http_request: Request,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    authorization = (
        f"Bearer {credentials.credentials}" if credentials else None
    )
    try:
        (
            share_id,
            permission,
            recipient_email,
            owner_email,
            original_name,
            content_type,
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        ) = get_valid_share(token, authorization)

        # This endpoint is only for view permission.
        if permission != "view":
            raise HTTPException(
                status_code=403,
                detail="This link has download permission. Use the download link instead.",
            )

        # Browser preview is supported for PDFs only.
        if content_type != "application/pdf":
            raise HTTPException(
                status_code=403,
                detail="Only PDF files can be previewed. Create a download link for other file types.",
            )

        decrypted_content = fetch_decrypted_cloud_file(
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        )

        log_security_event(
            "FILE_SHARE_VIEWED",
            recipient_email,
            f"Viewed shared PDF, share ID {share_id}",
        )

        log_activity(
            activity_type="FILE_ACCESS",
            status="SUCCESS",
            user_email=recipient_email,
            ip_address=http_request.client.host if http_request.client else None,
        )

        log_audit_event(
            user_email=recipient_email,
            activity_type="FILE_ACCESS",
            description=f"Viewed shared PDF, share ID {share_id}",
            status="SUCCESS",
            ip_address=http_request.client.host if http_request.client else None,
        )

        safe_filename = quote(original_name, safe="")

        return Response(
            content=decrypted_content,
            media_type="application/pdf",
            headers={
                "Content-Disposition": (
                    f"inline; filename*=UTF-8''{safe_filename}"
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print("Shared PDF view error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to view shared file",
        )


# ---------------- DOWNLOAD A SHARED FILE ----------------

@app.get("/share/{token}/download")
def download_shared_file(
    token: str,
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
):
    authorization = (
        f"Bearer {credentials.credentials}" if credentials else None
    )
    try:
        (
            share_id,
            permission,
            recipient_email,
            owner_email,
            original_name,
            content_type,
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        ) = get_valid_share(token, authorization)

        # This endpoint is only for download permission.
        if permission != "download":
            raise HTTPException(
                status_code=403,
                detail="This link only allows viewing, not downloading",
            )

        decrypted_content = fetch_decrypted_cloud_file(
            storage_path,
            wrapped_key_nonce,
            wrapped_file_key,
        )

        log_security_event(
            "FILE_SHARE_DOWNLOADED",
            recipient_email,
            f"Downloaded shared file, share ID {share_id}",
        )

        log_audit_event(
            user_email=recipient_email,
            activity_type="SHARED_FILE_DOWNLOAD",
            description=f"Downloaded shared file, share ID {share_id}",
            status="SUCCESS",
        )

        create_notification(
            user_email=owner_email,
            title="File Downloaded",
            message="A shared file was downloaded.",
            notification_type="FILE_DOWNLOADED",
        )

        safe_filename = quote(original_name, safe="")

        return Response(
            content=decrypted_content,
            media_type=content_type or "application/octet-stream",
            headers={
                "Content-Disposition": (
                    f"attachment; filename*=UTF-8''{safe_filename}"
                ),
                "Cache-Control": "no-store",
                "X-Content-Type-Options": "nosniff",
                "Referrer-Policy": "no-referrer",
            },
        )

    except HTTPException:
        raise

    except Exception as e:
        print("Shared file download error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to download shared file",
        )


# ---------------- USER DASHBOARD ----------------

@app.get("/dashboard/stats")
def dashboard_stats(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        COUNT(f.id),
                        COALESCE(SUM(f.file_size), 0)
                    FROM users AS u
                    LEFT JOIN files AS f ON f.owner_id = u.id
                    WHERE LOWER(u.email) = LOWER(%s)
                    GROUP BY u.id
                    """,
                    (current_user,),
                )

                result = cur.fetchone()

        if result is None:
            raise HTTPException(
                status_code=404,
                detail="User account not found",
            )

        total_files, storage_used_bytes = result

        return {
            "total_files": total_files,
            "storage_used_bytes": storage_used_bytes,
            "storage_used_mb": round(
                storage_used_bytes / (1024 ** 2), 2
            ),
            "user_storage": user_storage,
            "file_type_stats": file_type_stats,
            "storage_limit": "5 MB per file",
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Dashboard stats error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve dashboard statistics",
        )


# ---------------- ADMIN DASHBOARD ----------------


@app.get("/admin/dashboard/stats")
def admin_dashboard_stats(
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:

                # Overall statistics
                cur.execute("SELECT COUNT(*) FROM users")
                total_users = cur.fetchone()[0]

                cur.execute("""
                    SELECT COUNT(*), COALESCE(SUM(file_size), 0)
                    FROM files
                """)
                total_files, storage_used_bytes = cur.fetchone()

                                # User-wise storage statistics
                cur.execute("""
                    SELECT
                        u.id,
                        u.full_name,
                        u.email,
                        COUNT(f.id),
                        COALESCE(SUM(f.file_size), 0)
                    FROM users u
                    LEFT JOIN files f ON f.owner_id = u.id
                    GROUP BY u.id, u.full_name, u.email
                    ORDER BY COALESCE(SUM(f.file_size), 0) DESC
                """)

                user_storage = [
                    {
                        "user_id": row[0],
                        "full_name": row[1],
                        "email": row[2],
                        "total_files": row[3],
                        "storage_used_bytes": row[4],
                        "storage_used_mb": round(row[4] / (1024 ** 2), 2)
                    }
                    for row in cur.fetchall()
                ]
                                # File type statistics
                cur.execute("""
                    SELECT
                        COALESCE(content_type, 'Unknown'),
                        COUNT(*),
                        COALESCE(SUM(file_size), 0)
                    FROM files
                    GROUP BY COALESCE(content_type, 'Unknown')
                    ORDER BY COUNT(*) DESC
                """)

                file_type_stats = [
                    {
                        "file_type": row[0],
                        "total_files": row[1],
                        "storage_used_bytes": row[2],
                        "storage_used_mb": round(row[2] / (1024 ** 2), 2)
                    }
                    for row in cur.fetchall()
                ]
 
                cur.execute("SELECT COUNT(*) FROM file_shares")
                total_shares = cur.fetchone()[0]

                cur.execute("SELECT COUNT(*) FROM security_events")
                total_security_events = cur.fetchone()[0]

                # User growth - last 7 days
                cur.execute("""
                    SELECT
                        TO_CHAR(days.day, 'YYYY-MM-DD'),
                        COUNT(u.id)
                    FROM generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    ) AS days(day)
                    LEFT JOIN users u
                        ON u.created_at >= days.day
                        AND u.created_at < days.day + INTERVAL '1 day'
                    GROUP BY days.day
                    ORDER BY days.day
                """)
                daily_user_growth = [
                    {"date": row[0], "count": row[1]}
                    for row in cur.fetchall()
                ]

                # File uploads - last 7 days
                cur.execute("""
                    SELECT
                        TO_CHAR(days.day, 'YYYY-MM-DD'),
                        COUNT(f.id)
                    FROM generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    ) AS days(day)
                    LEFT JOIN files f
                        ON f.created_at >= days.day
                        AND f.created_at < days.day + INTERVAL '1 day'
                    GROUP BY days.day
                    ORDER BY days.day
                """)
                daily_file_uploads = [
                    {"date": row[0], "count": row[1]}
                    for row in cur.fetchall()
                ]

                # Sharing activity - last 7 days
                cur.execute("""
                    SELECT
                        TO_CHAR(days.day, 'YYYY-MM-DD'),
                        COUNT(fs.id)
                    FROM generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    ) AS days(day)
                    LEFT JOIN file_shares fs
                        ON fs.created_at >= days.day
                        AND fs.created_at < days.day + INTERVAL '1 day'
                    GROUP BY days.day
                    ORDER BY days.day
                """)
                daily_sharing_activity = [
                    {"date": row[0], "count": row[1]}
                    for row in cur.fetchall()
                ]

                # Security activity - last 7 days
                cur.execute("""
                    SELECT
                        TO_CHAR(days.day, 'YYYY-MM-DD'),
                        COUNT(se.id)
                    FROM generate_series(
                        CURRENT_DATE - INTERVAL '6 days',
                        CURRENT_DATE,
                        INTERVAL '1 day'
                    ) AS days(day)
                    LEFT JOIN security_events se
                        ON se.created_at >= days.day
                        AND se.created_at < days.day + INTERVAL '1 day'
                    GROUP BY days.day
                    ORDER BY days.day
                """)
                daily_security_activity = [
                    {"date": row[0], "count": row[1]}
                    for row in cur.fetchall()
                ]

        return {
            "admin_email": admin_user,
            "total_users": total_users,
            "total_files": total_files,
            "total_shares": total_shares,
            "total_security_events": total_security_events,
            "storage_used_bytes": storage_used_bytes,
            "storage_used_mb": round(
                storage_used_bytes / (1024 ** 2), 2
            ),
            "user_storage": user_storage,
            "file_type_stats": file_type_stats,
            "daily_user_growth": daily_user_growth,
            "daily_file_uploads": daily_file_uploads,
            "daily_sharing_activity": daily_sharing_activity,
            "daily_security_activity": daily_security_activity,
        }

    except Exception as e:
        print("Admin dashboard error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve admin statistics",
        )

        # ---------------- ADMIN FILE MANAGEMENT ----------------

@app.get("/admin/files")
def get_admin_files(
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        f.id,
                        f.original_name,
                        f.file_size,
                        f.content_type,
                        f.created_at,
                        u.full_name,
                        u.email
                    FROM files AS f
                    JOIN users AS u ON u.id = f.owner_id
                    ORDER BY f.created_at DESC
                    """
                )

                rows = cur.fetchall()

        files = [
            {
                "id": row[0],
                "original_name": row[1],
                "file_size": row[2],
                "content_type": row[3],
                "created_at": (
                    row[4].isoformat() if row[4] else None
                ),
                "owner_name": row[5],
                "owner_email": row[6],
            }
            for row in rows
        ]

        return {
            "total_files": len(files),
            "files": files,
        }

    except Exception as e:
        print("Admin files error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve all files",
        )
        # ---------------- ADMIN SHARING REPORTS ----------------

@app.get("/admin/sharing-reports")
def get_admin_sharing_reports(
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        fs.id,
                        fs.file_id,
                        f.original_name,
                        owner.full_name,
                        owner.email,
                        fs.recipient_email,
                        fs.permission,
                        fs.created_at,
                        fs.expires_at,
                        fs.revoked_at,
                        CASE
                            WHEN fs.revoked_at IS NOT NULL
                                THEN 'Revoked'
                            WHEN fs.expires_at IS NOT NULL
                                 AND fs.expires_at <= NOW()
                                THEN 'Expired'
                            ELSE 'Active'
                        END AS share_status
                    FROM file_shares AS fs
                    JOIN files AS f ON f.id = fs.file_id
                    JOIN users AS owner ON owner.id = fs.owner_id
                    ORDER BY fs.created_at DESC
                    """
                )

                rows = cur.fetchall()

        shares = [
            {
                "share_id": row[0],
                "file_id": row[1],
                "file_name": row[2],
                "owner_name": row[3],
                "owner_email": row[4],
                "recipient_email": row[5],
                "permission": row[6],
                "created_at": row[7].isoformat() if row[7] else None,
                "expires_at": row[8].isoformat() if row[8] else None,
                "revoked_at": row[9].isoformat() if row[9] else None,
                "status": row[10],
            }
            for row in rows
        ]

        return {
            "total_shares": len(shares),
            "active_shares": sum(
                1 for s in shares if s["status"] == "Active"
            ),
            "expired_shares": sum(
                1 for s in shares if s["status"] == "Expired"
            ),
            "revoked_shares": sum(
                1 for s in shares if s["status"] == "Revoked"
            ),
            "shares": shares,
        }

    except Exception as e:
        print("Admin sharing reports error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve admin sharing reports",
        )


# ---------------- ADMIN USER MANAGEMENT ----------------

@app.get("/admin/users")
def get_admin_users(
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        full_name,
                        email,
                        role,
                        created_at
                    FROM users
                    ORDER BY created_at DESC
                    """
                )

                rows = cur.fetchall()

        users = [
            {
                "id": row[0],
                "full_name": row[1],
                "email": row[2],
                "role": row[3],
                "created_at": (
                    row[4].isoformat() if row[4] else None
                ),
            }
            for row in rows
        ]

        return {
            "total_users": len(users),
            "users": users,
        }

    except Exception as e:
        print("Admin users error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve users",
        )


# ---------------- ADMIN SECURITY EVENTS ----------------

@app.get("/admin/security/events")
def get_security_events(
    admin_user: str = Depends(require_admin),
    limit: int = Query(default=100, ge=1, le=500),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        id,
                        event_type,
                        actor_email,
                        details,
                        created_at
                    FROM security_events
                    ORDER BY created_at DESC, id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )

                rows = cur.fetchall()

        return {
            "events": [
                {
                    "id": row[0],
                    "event_type": row[1],
                    "actor_email": row[2],
                    "details": row[3],
                    "created_at": (
                        row[4].isoformat() if row[4] else None
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Security events error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve security events",
        )

# ---------------- SUSPICIOUS ACTIVITY DETECTION ----------------

@app.get("/admin/suspicious-activity")
def get_suspicious_activity(
    severity: str | None = Query(default=None),
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    WITH event_rules AS (
                        SELECT *
                        FROM (VALUES
                            ('LOGIN_FAILED', 'High', 5,
                             'Repeated failed login attempts'),
                            ('AUTH_FAILED', 'Medium', 3,
                             'Repeated authentication failures'),
                            ('ADMIN_ACCESS_DENIED', 'Medium', 3,
                             'Repeated unauthorized admin access'),
                            ('FILE_SHARE_ACCESS_DENIED', 'High', 5,
                             'Repeated unauthorized share access'),
                            ('FILE_DOWNLOAD_SUCCESS', 'Medium', 10,
                             'Unusually frequent file downloads'),
                            ('FILE_SHARE_DOWNLOADED', 'Medium', 10,
                             'Unusually frequent shared file downloads'),
                            ('FILE_DELETE_SUCCESS', 'Low', 5,
                             'Unusually frequent file deletions')
                        ) AS rules(
                            event_type,
                            severity,
                            threshold,
                            description
                        )
                    )
                    SELECT
                        se.actor_email,
                        se.event_type,
                        er.severity,
                        er.description,
                        COUNT(*) AS total_attempts,
                        MIN(se.created_at) AS first_seen,
                        MAX(se.created_at) AS last_seen
                    FROM security_events se
                    JOIN event_rules er
                        ON se.event_type = er.event_type
                    WHERE se.created_at >= NOW() - INTERVAL '10 minutes'
                      AND (
    CAST(%s AS TEXT) IS NULL
    OR LOWER(er.severity) = LOWER(CAST(%s AS TEXT))
)
                    GROUP BY
                        se.actor_email,
                        se.event_type,
                        er.severity,
                        er.threshold,
                        er.description
                    HAVING COUNT(*) >= er.threshold
                    ORDER BY
                        CASE er.severity
                            WHEN 'High' THEN 1
                            WHEN 'Medium' THEN 2
                            ELSE 3
                        END,
                        total_attempts DESC
                    """,
                    (severity, severity),
                )

                rows = cur.fetchall()

        return {
            "total_suspicious_activities": len(rows),
            "activities": [
                {
                    "actor_email": row[0],
                    "event_type": row[1],
                    "severity": row[2],
                    "description": row[3],
                    "total_attempts": row[4],
                    "first_seen": row[5].isoformat() if row[5] else None,
                    "last_seen": row[6].isoformat() if row[6] else None,
                }
                for row in rows
            ],
        }

    except Exception as e:
        print("Suspicious activity error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve suspicious activities",
        )

# ---------------- ADMIN AUDIT LOGS ----------------

@app.get("/audit-logs")
def get_audit_logs(
    admin_user: str = Depends(require_admin),
    limit: int = Query(default=100, ge=1, le=500),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        log_id,
                        user_id,
                        username,
                        activity_type,
                        file_id,
                        activity_description,
                        activity_status,
                        ip_address,
                        created_at
                    FROM audit_logs
                    ORDER BY created_at DESC, log_id DESC
                    LIMIT %s
                    """,
                    (limit,),
                )

                rows = cur.fetchall()

        return {
            "audit_logs": [
                {
                    "log_id": row[0],
                    "user_id": row[1],
                    "username": row[2],
                    "activity_type": row[3],
                    "file_id": row[4],
                    "description": row[5],
                    "status": row[6],
                    "ip_address": row[7],
                    "created_at": (
                        row[8].isoformat() if row[8] else None
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Audit logs error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve audit logs",
        )


 # ---------------- AUDIT LOGS BY USER ----------------

@app.get("/audit-logs/user/{user_id}")
def get_audit_logs_by_user(
    user_id: int,
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        log_id,
                        user_id,
                        username,
                        activity_type,
                        file_id,
                        activity_description,
                        activity_status,
                        ip_address,
                        created_at
                    FROM audit_logs
                    WHERE user_id = %s
                    ORDER BY created_at DESC, log_id DESC
                    """,
                    (user_id,),
                )

                rows = cur.fetchall()

        return {
            "audit_logs": [
                {
                    "log_id": row[0],
                    "user_id": row[1],
                    "username": row[2],
                    "activity_type": row[3],
                    "file_id": row[4],
                    "description": row[5],
                    "status": row[6],
                    "ip_address": row[7],
                    "created_at": row[8].isoformat() if row[8] else None,
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("User audit logs error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve user audit logs",
        )  

# ---------------- AUDIT LOGS BY FILE ----------------

@app.get("/audit-logs/file/{file_id}")
def get_audit_logs_by_file(
    file_id: int,
    admin_user: str = Depends(require_admin),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        log_id,
                        user_id,
                        username,
                        activity_type,
                        file_id,
                        activity_description,
                        activity_status,
                        ip_address,
                        created_at
                    FROM audit_logs
                    WHERE file_id = %s
                    ORDER BY created_at DESC, log_id DESC
                    """,
                    (file_id,),
                )

                rows = cur.fetchall()

        return {
            "audit_logs": [
                {
                    "log_id": row[0],
                    "user_id": row[1],
                    "username": row[2],
                    "activity_type": row[3],
                    "file_id": row[4],
                    "description": row[5],
                    "status": row[6],
                    "ip_address": row[7],
                    "created_at": row[8].isoformat() if row[8] else None,
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("File audit logs error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve file audit logs",
        )
        


# ---------------- AUDIT LOGS FILTER ----------------

@app.get("/audit-logs/filter")
def filter_audit_logs(
    user_id: int | None = None,
    activity_type: str | None = None,
    file_id: int | None = None,
    file_name: str | None = None,
    status: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    admin_user: str = Depends(require_admin),
):
    try:
        query = """
            SELECT
                a.log_id,
                a.user_id,
                a.username,
                a.activity_type,
                a.file_id,
                a.activity_description,
                a.activity_status,
                a.ip_address,
                a.created_at
            FROM audit_logs a
            LEFT JOIN files f ON a.file_id = f.id
            WHERE 1=1
        """

        params = []

        if user_id is not None:
            query += " AND a.user_id = %s"
            params.append(user_id)

        if activity_type:
            query += " AND LOWER(a.activity_type) = LOWER(%s)"
            params.append(activity_type)

        if file_id is not None:
            query += " AND a.file_id = %s"
            params.append(file_id)

        if file_name:
            query += " AND f.original_name ILIKE %s"
            params.append(f"%{file_name}%")

        if status:
            query += " AND LOWER(a.activity_status) = LOWER(%s)"
            params.append(status)

        if start_date:
            query += " AND a.created_at >= %s::date"
            params.append(start_date)

        if end_date:
            query += " AND a.created_at < (%s::date + INTERVAL '1 day')"
            params.append(end_date)

        query += " ORDER BY a.created_at DESC, a.log_id DESC LIMIT 500"

        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(query, tuple(params))
                rows = cur.fetchall()

        return {
            "audit_logs": [
                {
                    "log_id": row[0],
                    "user_id": row[1],
                    "username": row[2],
                    "activity_type": row[3],
                    "file_id": row[4],
                    "description": row[5],
                    "status": row[6],
                    "ip_address": row[7],
                    "created_at": row[8].isoformat() if row[8] else None,
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Audit log filter error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to filter audit logs",
        )


# ---------------- ADMIN REPORTS ----------------

@app.get("/admin/reports")
def get_admin_reports(
    start_date: str | None = None,
    end_date: str | None = None,
    admin_user: str = Depends(require_admin),
):
    try:
        date_filter = ""
        params = []

        if start_date:
            date_filter += " AND created_at >= %s::date"
            params.append(start_date)

        if end_date:
            date_filter += " AND created_at < (%s::date + INTERVAL '1 day')"
            params.append(end_date)

        with get_db_connection() as conn:
            with conn.cursor() as cur:

                # Upload Reports
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM activity_logs
                    WHERE UPPER(activity_type) = 'UPLOAD'
                    AND UPPER(status) = 'SUCCESS'
                    """ + date_filter,
                    tuple(params),
                )
                total_uploads = cur.fetchone()[0]

                # Download Reports
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM activity_logs
                    WHERE UPPER(activity_type) IN
                        ('DOWNLOAD', 'SHARED_FILE_DOWNLOAD')
                    AND UPPER(status) = 'SUCCESS'
                    """ + date_filter,
                    tuple(params),
                )
                total_downloads = cur.fetchone()[0]

                # User Reports
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM users
                    WHERE 1=1
                    """ + date_filter,
                    tuple(params),
                )
                total_users = cur.fetchone()[0]

                # Sharing Reports
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM file_shares
                    WHERE 1=1
                    """ + date_filter,
                    tuple(params),
                )
                total_shares = cur.fetchone()[0]

                # Security Reports
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM security_events
                    WHERE 1=1
                    """ + date_filter,
                    tuple(params),
                )
                total_security_events = cur.fetchone()[0]


                # Daily Upload Reports
                cur.execute(
                      """
                      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD'), COUNT(*)
                      FROM activity_logs
                      WHERE UPPER(activity_type) = 'UPLOAD'
                      AND UPPER(status) = 'SUCCESS'
                      """ + date_filter + """
                      GROUP BY created_at::date
                      ORDER BY created_at::date
                      """,
                      tuple(params),
                )
                daily_uploads = [
                      {"date": row[0], "count": row[1]}
                      for row in cur.fetchall()
                ]

                  # Daily Download Reports
                cur.execute(
                      """
                      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD'), COUNT(*)
                      FROM activity_logs
                      WHERE UPPER(activity_type) IN
                          ('DOWNLOAD', 'SHARED_FILE_DOWNLOAD')
                      AND UPPER(status) = 'SUCCESS'
                      """ + date_filter + """
                      GROUP BY created_at::date
                      ORDER BY created_at::date
                      """,
                      tuple(params),
                )
                daily_downloads = [
                      {"date": row[0], "count": row[1]}
                      for row in cur.fetchall()
                ]

                  # Daily User Reports
                cur.execute(
                      """
                      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD'), COUNT(*)
                      FROM users
                      WHERE 1=1
                      """ + date_filter + """
                      GROUP BY created_at::date
                      ORDER BY created_at::date
                      """,
                      tuple(params),
                )
                daily_users = [
                      {"date": row[0], "count": row[1]}
                      for row in cur.fetchall()
                ]

                  # Daily Sharing Reports
                cur.execute(
                      """
                      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD'), COUNT(*)
                      FROM file_shares
                      WHERE 1=1
                      """ + date_filter + """
                      GROUP BY created_at::date
                      ORDER BY created_at::date
                      """,
                      tuple(params),
                )
                daily_shares = [
                      {"date": row[0], "count": row[1]}
                      for row in cur.fetchall()
                ]

                  # Daily Security Reports
                cur.execute(
                      """
                      SELECT TO_CHAR(created_at::date, 'YYYY-MM-DD'), COUNT(*)
                      FROM security_events
                      WHERE 1=1
                      """ + date_filter + """
                      GROUP BY created_at::date
                      ORDER BY created_at::date
                      """,
                      tuple(params),
                )
                daily_security = [
                      {"date": row[0], "count": row[1]}
                      for row in cur.fetchall()
                ]

                

        return {
            "total_uploads": total_uploads,
            "total_downloads": total_downloads,
            "total_users": total_users,
            "total_shares": total_shares,
            "total_security_events": total_security_events,
            "daily_uploads": daily_uploads,
            "daily_downloads": daily_downloads,
            "daily_users": daily_users,
            "daily_shares": daily_shares,
            "daily_security": daily_security,
            "start_date": start_date,
            "end_date": end_date,
        }

    except Exception as e:
        print("Admin reports error:", repr(e))
        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve admin reports",
        )


# ---------------- ADMIN SYSTEM MONITORING ----------------

@app.get("/admin/system-monitoring")
def get_system_monitoring(
    admin_user: str = Depends(require_admin),
):
    try:
        # CPU usage
        cpu_usage = psutil.cpu_percent(interval=1)

        # Memory usage
        memory = psutil.virtual_memory()

        # Disk usage
        disk = psutil.disk_usage(str(BASE_DIR))

        # System uptime
        boot_time = psutil.boot_time()
        uptime_seconds = int(datetime.now().timestamp() - boot_time)

        return {
            "status": "success",
            "timestamp": datetime.now(timezone.utc).isoformat(),

            "cpu": {
                "usage_percent": cpu_usage,
            },

            "memory": {
                "total_gb": round(memory.total / (1024 ** 3), 2),
                "used_gb": round(memory.used / (1024 ** 3), 2),
                "available_gb": round(memory.available / (1024 ** 3), 2),
                "usage_percent": memory.percent,
            },

            "disk": {
                "total_gb": round(disk.total / (1024 ** 3), 2),
                "used_gb": round(disk.used / (1024 ** 3), 2),
                "free_gb": round(disk.free / (1024 ** 3), 2),
                "usage_percent": disk.percent,
            },

            "uptime_seconds": uptime_seconds,
        }

    except Exception as e:
        print("System monitoring error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve system monitoring data",
        )


# ---------------- NOTIFICATIONS API ----------------

@app.get("/notifications")
def get_notifications(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT
                        n.notification_id,
                        n.title,
                        n.message,
                        n.notification_type,
                        n.related_file_id,
                        n.is_read,
                        n.created_at
                    FROM notifications AS n
                    JOIN users AS u ON u.id = n.user_id
                    WHERE LOWER(u.email) = LOWER(%s)
                    ORDER BY n.created_at DESC
                    LIMIT 50
                    """,
                    (current_user,),
                )

                rows = cur.fetchall()

        return {
            "notifications": [
                {
                    "notification_id": row[0],
                    "title": row[1],
                    "message": row[2],
                    "notification_type": row[3],
                    "related_file_id": row[4],
                    "is_read": row[5],
                    "created_at": (
                        row[6].isoformat() if row[6] else None
                    ),
                }
                for row in rows
            ]
        }

    except Exception as e:
        print("Notifications retrieval error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve notifications",
        )

@app.get("/notifications/unread-count")
def get_unread_notification_count(
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COUNT(*)
                    FROM notifications AS n
                    JOIN users AS u ON u.id = n.user_id
                    WHERE LOWER(u.email) = LOWER(%s)
                      AND n.is_read = FALSE
                    """,
                    (current_user,),
                )

                count = cur.fetchone()[0]

        return {
            "unread_count": count
        }

    except Exception as e:
        print("Unread notification count error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to retrieve unread notification count",
        )


@app.patch("/notifications/{notification_id}/read")
def mark_notification_as_read(
    notification_id: int,
    current_user: str = Depends(get_current_user),
):
    try:
        with get_db_connection() as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE notifications AS n
                    SET is_read = TRUE
                    FROM users AS u
                    WHERE n.user_id = u.id
                      AND n.notification_id = %s
                      AND LOWER(u.email) = LOWER(%s)
                    RETURNING n.notification_id
                    """,
                    (notification_id, current_user),
                )

                updated = cur.fetchone()

        if updated is None:
            raise HTTPException(
                status_code=404,
                detail="Notification not found",
            )

        return {
            "message": "Notification marked as read",
            "notification_id": updated[0],
        }

    except HTTPException:
        raise

    except Exception as e:
        print("Mark notification as read error:", repr(e))

        raise HTTPException(
            status_code=500,
            detail="Unable to mark notification as read",
        )

