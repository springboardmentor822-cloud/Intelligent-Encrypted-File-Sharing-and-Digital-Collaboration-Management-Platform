from app.services.encryption_service import EncryptionService
from cryptography.exceptions import InvalidTag

key = EncryptionService.generate_key()
data = b"TrustShare Milestone 2 Integrity Test"

encrypted = EncryptionService.encrypt_file(data, key)

decrypted = EncryptionService.decrypt_file(
    encrypted["encrypted_data"], key, encrypted["nonce"]
)

print("NORMAL DECRYPTION:", decrypted == data)

tampered = bytearray(encrypted["encrypted_data"])
tampered[0] ^= 1

try:
    EncryptionService.decrypt_file(bytes(tampered), key, encrypted["nonce"])
    print("TAMPER DETECTION: FAIL")
except InvalidTag:
    print("TAMPER DETECTION: PASS")