import os
from sqlalchemy import text
from app.database import engine, Base, SessionLocal
from app.models import User, UserRole, FileRecord, ShareLink
from app.security import hash_password

def migrate_and_seed():
    print("Connecting to PostgreSQL to check columns...")
    # Check and add columns with individual autocommit connections
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as conn:
        result = conn.execute(text("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"))
        existing_cols = {row[0] for row in result}
        print("Existing columns in 'users':", existing_cols)

        if "is_mfa_enabled" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN is_mfa_enabled BOOLEAN DEFAULT FALSE NOT NULL"))
            print("Added is_mfa_enabled")
        if "mfa_secret" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN mfa_secret VARCHAR(255)"))
            print("Added mfa_secret")
        if "oauth_provider" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN oauth_provider VARCHAR(50)"))
            print("Added oauth_provider")
        if "oauth_provider_id" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN oauth_provider_id VARCHAR(255)"))
            print("Added oauth_provider_id")
        if "role" not in existing_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN role userrole DEFAULT 'user' NOT NULL"))
            print("Added role")

    # Create tables if not exist
    Base.metadata.create_all(bind=engine)

    # Seed test users if none exist or verify admin user exists
    db = SessionLocal()
    try:
        admin_user = db.query(User).filter(User.username == "admin").first()
        if not admin_user:
            admin_user = User(
                email="admin@trustshare.io",
                username="admin",
                full_name="System Administrator",
                hashed_password=hash_password("Admin@123456"),
                role=UserRole.ADMIN,
                is_active=True
            )
            db.add(admin_user)
            print("Created default admin user: admin / Admin@123456")
        else:
            # Ensure it is admin
            admin_user.role = UserRole.ADMIN
            print("Admin user already exists:", admin_user.email)

        demo_user = db.query(User).filter(User.username == "demo_user").first()
        if not demo_user:
            demo_user = User(
                email="user@trustshare.io",
                username="demo_user",
                full_name="Demo User",
                hashed_password=hash_password("User@123456"),
                role=UserRole.USER,
                is_active=True
            )
            db.add(demo_user)
            print("Created default standard user: demo_user / User@123456")

        db.commit()
        all_users = db.query(User).all()
        print("Total users in DB now:", len(all_users))
        for u in all_users:
            print(f"- {u.id}: {u.username} ({u.email}) [{u.role.value}]")
    finally:
        db.close()

if __name__ == "__main__":
    migrate_and_seed()
