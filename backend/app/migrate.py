"""Lightweight, dependency-free schema upgrades for SQLite/PostgreSQL.

`Base.metadata.create_all()` only creates missing *tables*; it never adds new
*columns* to tables that already exist.  TrustShare ships with a pre-populated
``data/trustshare.db`` (and users may run against an older PostgreSQL), so a
model that gained a column (e.g. ``security_alerts.rule``) would otherwise make
every query against that table fail with ``no such column`` -> HTTP 500.

This module reconciles an existing database with the current ORM metadata by
adding any missing nullable/defaulted columns.  It is idempotent and safe to run
on every startup.
"""

from __future__ import annotations

import logging

from sqlalchemy import inspect, text
from sqlalchemy.engine import Engine

from .db import Base

log = logging.getLogger("trustshare.migrate")


def _sqlite_type(col) -> str:
    # SQLAlchemy's compiled type renders correctly for the target dialect.
    try:
        return col.type.compile(dialect=Engine.dialect)
    except Exception:  # pragma: no cover - defensive
        return "TEXT"


def _default_clause(col) -> str:
    """Return a SQL DEFAULT clause for a column that may be NOT NULL.

    Existing rows need a value, so we derive a sensible constant default from
    the model definition.  Anything we cannot express falls back to NULL, in
    which case the column is added as nullable.
    """
    default = getattr(col, "default", None)
    server_default = getattr(col, "server_default", None)
    if server_default is not None:
        arg = getattr(server_default, "arg", None)
        if arg is not None:
            return f" DEFAULT '{str(arg).replace(chr(39), chr(39) * 2)}'"
    if default is not None and getattr(default, "is_scalar", False):
        val = default.arg
        if isinstance(val, bool):
            return f" DEFAULT {1 if val else 0}"
        if isinstance(val, (int, float)):
            return f" DEFAULT {val}"
        if isinstance(val, str):
            return " DEFAULT '" + val.replace("'", "''") + "'"
    return ""


def ensure_schema(engine: Engine) -> None:
    """Add any columns present in the models but missing from the database."""
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())

    with engine.begin() as conn:
        for table_name, table in Base.metadata.tables.items():
            if table_name not in existing_tables:
                continue  # create_all() will have created brand-new tables
            db_cols = {c["name"] for c in inspector.get_columns(table_name)}
            for col in table.columns:
                if col.name in db_cols:
                    continue
                ddl = f'ALTER TABLE "{table_name}" ADD COLUMN "{col.name}" {_sqlite_type(col)}'
                if not col.nullable:
                    clause = _default_clause(col)
                    # Only enforce NOT NULL when we can backfill existing rows.
                    if clause:
                        ddl += " NOT NULL" + clause
                try:
                    conn.execute(text(ddl))
                    log.warning("schema upgrade: added %s.%s", table_name, col.name)
                except Exception as exc:  # pragma: no cover - best effort
                    log.error("schema upgrade failed for %s.%s: %s", table_name, col.name, exc)


def ensure_admin(engine: Engine) -> None:
    """Guarantee that the admin portal is reachable out of the box.

    Public registration can never grant the ``admin`` role, and the database
    shipped with the project contains only ordinary users.  Without a seeded
    administrator the whole ``/admin`` area would be unreachable, so on first
    boot we provision one from ``TS_ADMIN_EMAIL`` / ``TS_ADMIN_PASSWORD`` when
    provided, falling back to a documented default account.
    """
    import os

    from sqlalchemy import func, select
    from sqlalchemy.orm import Session

    from .models import User
    from .services.security import hash_password

    with Session(engine) as db:
        admins = db.scalar(select(func.count()).select_from(User).where(User.role == "admin"))
        if admins:
            return
        email = os.environ.get("TS_ADMIN_EMAIL", "admin@trustshare.dev").strip().lower()
        password = os.environ.get("TS_ADMIN_PASSWORD", "AdminPass123!")
        existing = db.scalar(select(User).where(User.email == email))
        if existing is not None:
            existing.role = "admin"
            existing.is_active = True
            existing.is_verified = True
            existing.password_hash = hash_password(password)
            db.commit()
            log.warning("bootstrap: promoted %s to administrator", email)
            return
        from .config import get_settings

        settings = get_settings()
        db.add(
            User(
                email=email,
                full_name="Site Administrator",
                role="admin",
                is_verified=True,
                password_hash=hash_password(password),
                quota_bytes=settings.user_quota_mb * 1024 * 1024,
            )
        )
        db.commit()
        log.warning(
            "bootstrap: created default administrator %s (password: %s) - change it before deploying",
            email,
            password,
        )
