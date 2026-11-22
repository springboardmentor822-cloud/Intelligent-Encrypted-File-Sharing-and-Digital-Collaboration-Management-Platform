
from encryption_service import (
    generate_key,
    encrypt_file,
    decrypt_file,
    wrap_file_key,
    unwrap_file_key,
)

original_data = b"TrustShare master key test"

# Generate a file-specific key
file_key = generate_key()

# Protect the file key with the master key
wrapping_nonce, wrapped_key = wrap_file_key(file_key)

# Recover the original file key
recovered_key = unwrap_file_key(wrapping_nonce, wrapped_key)

# Test file encryption and decryption
file_nonce, encrypted_data = encrypt_file(original_data, file_key)
decrypted_data = decrypt_file(file_nonce, encrypted_data, recovered_key)

assert recovered_key == file_key
assert decrypted_data == original_data

print("File key wrapping: SUCCESS")
print("File key recovery: SUCCESS")
print("File encryption/decryption: SUCCESS")
