
from supabase_client import supabase
from encryption_service import generate_key, encrypt_file, decrypt_file

# Original test data
original_data = b"TrustShare encrypted cloud storage test"

# Generate key and encrypt
key = generate_key()
nonce, encrypted_data = encrypt_file(original_data, key)

# Store nonce + encrypted data together
blob = nonce + encrypted_data

file_path = "tests/encrypted_test.bin"

try:
    # Upload encrypted data with nonce
    supabase.storage.from_("TrustShare-Files").upload(
        path=file_path,
        file=blob,
        file_options={
            "content-type": "application/octet-stream",
            "upsert": "true",
        },
    )
    print("Encrypted cloud upload: SUCCESS")

    # Download from Supabase
    downloaded_blob = supabase.storage.from_("TrustShare-Files").download(
        file_path
    )
    print("Cloud download: SUCCESS")

    # Extract nonce (first 12 bytes) and encrypted content
    downloaded_nonce = downloaded_blob[:12]
    downloaded_ciphertext = downloaded_blob[12:]

    # Decrypt
    decrypted_data = decrypt_file(
        downloaded_nonce,
        downloaded_ciphertext,
        key,
    )

    print("Decryption: SUCCESS")
    print("Original and decrypted data match:", decrypted_data == original_data)
    print("Encrypted data differs from original:", downloaded_blob != original_data)

except Exception as error:
    print("Cloud encryption test failed:", error)
