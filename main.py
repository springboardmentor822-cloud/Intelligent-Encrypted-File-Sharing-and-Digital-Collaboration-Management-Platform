
from contextlib import asynccontextmanager
from app.services.notification_service import NotificationService
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.database import Base, engine
from app.models import User, File, LoginAttempt, FileShare
from app.routes import router

from app.services.mongodb_service import MongoDBService
from app.services.audit_service import AuditService
from app.services.redis_service import RedisService


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        MongoDBService.connect()
        print("MongoDB connected successfully!")
        
        AuditService.ensure_indexes()
        print("Audit logging service initialized!")

        NotificationService.ensure_indexes()
        print("Notification service initialized!")
      
        RedisService.connect()
        print("Redis connected successfully!")

        yield

    finally:
        RedisService.close()
        MongoDBService.close()
        print("Database connections closed.")


app = FastAPI(
    title="TrustShare API",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

Base.metadata.create_all(bind=engine)

app.include_router(router)


@app.get("/")
def home():
    return {
        "message": "Welcome to TrustShare!",
        "status": "Backend is running"
    }


@app.get("/health")
def health():
    return {
        "status": "healthy",
        "mongodb": "connected",
        "redis": "connected"
    }
