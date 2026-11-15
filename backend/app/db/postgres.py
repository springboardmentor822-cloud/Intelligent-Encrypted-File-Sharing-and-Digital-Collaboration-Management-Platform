from sqlalchemy import text
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase

from app.core.config import settings

engine = create_async_engine(settings.postgres_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    """All PostgreSQL tables inherit from this."""


async def get_db():
    """FastAPI dependency: one database session per request."""
    async with SessionLocal() as session:
        yield session


async def check_postgres() -> None:
    async with engine.connect() as conn:
        await conn.execute(text("SELECT 1"))
