
from supabase_client import supabase
from encryption_service import decrypt_file

# Temporary test key from the previous upload run.
# This is only for the current test; don't reuse it for real files.
key_hex = input("Paste the test key printed by the upload script: ").strip()
key = bytes.fromhex(key_hex)

file_path = "tests/encrypted_test.bin"

# Download encrypted file from Supabase
response = supabase.storage.from_("TrustShare-Files").download(file_path)

# AES-GCM nonce is the first 12 bytes.
nonce = response[:12]
encrypted_data = response[12:]

# Decrypt and verify
decrypted_data = decrypt_file(nonce, encrypted_data, key)

print("Cloud download: SUCCESS")
print("Decryption: SUCCESS")
print("Decrypted content:", decrypted_data.decode("utf-8"))

