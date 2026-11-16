from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from app.core.config import settings

# 1. Create database engine connecting to PostgreSQL
engine = create_engine(
    settings.get_database_url(),
    pool_pre_ping=True,  # Checks connection liveness before using
)

# 2. Factory for database sessions
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 3. Base class for all database models
Base = declarative_base()


# 4. Dependency function to yield database session per request
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
