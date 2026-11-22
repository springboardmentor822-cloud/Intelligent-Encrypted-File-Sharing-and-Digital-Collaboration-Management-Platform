import os
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_SECRET_KEY = os.getenv("SUPABASE_SECRET_KEY")

if not SUPABASE_URL or not SUPABASE_SECRET_KEY:
    raise ValueError("Supabase URL or secret key missing in .env")

supabase = create_client(SUPABASE_URL, SUPABASE_SECRET_KEY)

print("Supabase client initialized successfully!")