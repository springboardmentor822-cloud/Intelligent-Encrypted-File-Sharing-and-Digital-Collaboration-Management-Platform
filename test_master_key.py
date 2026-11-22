import os
from dotenv import load_dotenv

load_dotenv()

key_hex = os.getenv("TRUSTSHARE_MASTER_KEY", "")

try:
    key = bytes.fromhex(key_hex)
    if len(key) == 32 and len(key_hex) == 64:
        print("Master key configuration: SUCCESS")
    else:
        print("Master key missing or incorrect length.")
except ValueError:
    print("Master key must contain valid hexadecimal characters.")