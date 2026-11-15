"""Make an existing account an administrator (or create it).

Run it INSIDE the backend container, from the project folder:
    docker compose exec backend python scripts/make_admin.py you@example.com
    docker compose exec backend python scripts/make_admin.py new@example.com "Your Name" "Passw0rdOK1"   (creates the account)
"""
import asyncio
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from sqlalchemy import select  # noqa: E402

from app.core.security import hash_password  # noqa: E402
from app.db.postgres import SessionLocal  # noqa: E402
from app.models.postgres import Role, User  # noqa: E402


async def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("Usage: python scripts/make_admin.py <email> [full name] [password]")
    email = sys.argv[1].strip().lower()
    async with SessionLocal() as db:
        role = (await db.execute(select(Role).where(Role.name == "admin"))).scalar_one_or_none()
        if role is None:
            sys.exit("The roles do not exist yet. Start the backend once first (docker compose up -d).")
        user = (await db.execute(select(User).where(User.email == email))).scalar_one_or_none()
        if user is None:
            if len(sys.argv) < 4:
                sys.exit(f"No account with e-mail {email}. Register it first, or add a name and password to create it.")
            user = User(email=email, full_name=sys.argv[2], hashed_password=hash_password(sys.argv[3]), roles=[role])
            db.add(user)
            print(f"Created administrator {email}")
        else:
            if "admin" not in [r.name for r in user.roles]:
                user.roles.append(role)
            user.is_active, user.approval_status = True, "approved"
            print(f"{email} is now an administrator")
        await db.commit()
    print("Log out and log in again to see the Admin panel.")


asyncio.run(main())
