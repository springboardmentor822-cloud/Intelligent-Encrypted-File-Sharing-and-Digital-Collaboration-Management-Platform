import os
import sys
from datetime import datetime

# Add current directory to path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from database import engine, SessionLocal, Base
import models
from models.user import User, UserRole
from models.encryption_key_version import EncryptionKeyVersion
from services.authentication_service import AuthenticationService

def seed():
    print("🌱 Initializing TrustShare 2.0 Database Tables & Demo Accounts...")
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    try:
        # 1. Seed Likitha Manchikanti (Standard User)
        user_email = "likitha@trustshare.io"
        user = db.query(User).filter(User.email == user_email).first()
        if not user:
            print(f"Creating User account: {user_email}")
            user = User(
                email=user_email,
                full_name="Likitha Manchikanti",
                password_hash=AuthenticationService.hash_password("UserPass2026!"),
                role=UserRole.USER,
                is_active=True,
                storage_used_bytes=0,
                storage_quota_bytes=104857600,
                mfa_enabled=False
            )
            db.add(user)
        else:
            print(f"Updating User password: {user_email}")
            user.password_hash = AuthenticationService.hash_password("UserPass2026!")
            user.role = UserRole.USER
            user.is_active = True

        # 2. Seed Administrator Account
        admin_email = "admin@trustshare.io"
        admin = db.query(User).filter(User.email == admin_email).first()
        if not admin:
            print(f"Creating Admin account: {admin_email}")
            admin = User(
                email=admin_email,
                full_name="System Administrator",
                password_hash=AuthenticationService.hash_password("AdminPass2026!"),
                role=UserRole.ADMIN,
                is_active=True,
                storage_used_bytes=0,
                storage_quota_bytes=1073741824,  # 1 GB for admin
                mfa_enabled=True
            )
            db.add(admin)
        else:
            print(f"Updating Admin password: {admin_email}")
            admin.password_hash = AuthenticationService.hash_password("AdminPass2026!")
            admin.role = UserRole.ADMIN
            admin.is_active = True

        # 3. Seed Primary Encryption Key Version (KEK v1)
        key_v1 = db.query(EncryptionKeyVersion).filter(EncryptionKeyVersion.version == 1).first()
        if not key_v1:
            print("Provisioning Encryption Key Version: KEK v1")
            key_v1 = EncryptionKeyVersion(
                version=1,
                key_alias="master-kek-v1-primary",
                algorithm="AES-256-GCM",
                status="ACTIVE",
                created_at=datetime.utcnow()
            )
            db.add(key_v1)

        db.commit()
        print("✅ Database seeding completed successfully!")
        print("   User Login : likitha@trustshare.io / UserPass2026!")
        print("   Admin Login: admin@trustshare.io   / AdminPass2026!")

    except Exception as e:
        db.rollback()
        print("❌ Error seeding database:", e)
        raise e
    finally:
        db.close()

if __name__ == "__main__":
    seed()
