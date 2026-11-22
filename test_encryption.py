
from encryption_service import generate_key, encrypt_file, decrypt_file
from cryptography.exceptions import InvalidTag

# Sample file content
original_data = b"TrustShare secure file sharing test"

# Generate key and encrypt
key = generate_key()
nonce, encrypted_data = encrypt_file(original_data, key)

# Decrypt the data
decrypted_data = decrypt_file(nonce, encrypted_data, key)

# Verify encryption and decryption
assert decrypted_data == original_data

print("Encryption: SUCCESS")
print("Decryption: SUCCESS")
print("Original and decrypted data match!")
print("Encrypted data differs from original:", encrypted_data != original_data)

# Tampering test
tampered_data = bytearray(encrypted_data)
tampered_data[-1] ^= 1

try:
    decrypt_file(nonce, bytes(tampered_data), key)
    print("ERROR: Tampering was not detected")
except InvalidTag:
    print("Tampering Detection: SUCCESS")
# Test unique keys
key1 = generate_key()
key2 = generate_key()

print("Unique keys:", key1 != key2)

# Test unique nonces
nonce1, encrypted1 = encrypt_file(original_data, key1)
nonce2, encrypted2 = encrypt_file(original_data, key1)

print("Unique nonces:", nonce1 != nonce2)