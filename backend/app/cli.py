"""Administrator provisioning (the only way to create an admin; public registration can never set a role).
Usage:  TS_ADMIN_PASSWORD='...' python -m app.cli create-admin admin@example.com "Admin Name"
"""
import getpass, os, sys
from sqlalchemy import select
from .config import get_settings
from .db import Base, SessionLocal, engine
from .models import User
from .services.audit import audit
from .services.security import hash_password, password_problem


def create_admin(email: str, name: str):
    from pydantic import TypeAdapter, EmailStr, ValidationError
    try:
        email = str(TypeAdapter(EmailStr).validate_python(email))
    except ValidationError:
        sys.exit("Invalid email address (special-use domains such as .local are rejected)")
    s = get_settings(); Base.metadata.create_all(engine)
    pw = os.environ.get("TS_ADMIN_PASSWORD") or getpass.getpass("Admin password: ")
    if (p := password_problem(pw)): sys.exit(p)
    with SessionLocal() as db:
        u = db.scalar(select(User).where(User.email == email.lower()))
        if u:
            u.role = "admin"; u.password_hash = hash_password(pw); u.is_active = True
        else:
            u = User(email=email.lower(), full_name=name, role="admin", is_verified=True, password_hash=hash_password(pw), quota_bytes=s.user_quota_mb * 1024 * 1024)
            db.add(u)
        db.commit()
        audit(db, "admin.provisioned", actor_id=None, resource_type="user", resource_id=u.id, details={"via": "cli"})
    print(f"Administrator ready: {email}")


if __name__ == "__main__":
    if len(sys.argv) >= 3 and sys.argv[1] == "create-admin":
        create_admin(sys.argv[2], sys.argv[3] if len(sys.argv) > 3 else "Administrator")
    else:
        sys.exit(__doc__)
