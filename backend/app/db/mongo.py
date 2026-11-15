from motor.motor_asyncio import AsyncIOMotorClient

from app.core.config import settings

client = AsyncIOMotorClient(settings.mongo_url, serverSelectionTimeoutMS=3000)
mongo_db = client[settings.MONGO_DB_NAME]


async def check_mongo() -> None:
    await client.admin.command("ping")
