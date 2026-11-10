"""
TrustShare - Cryptographic Service Re-export & Backward Compatibility Layer
Points directly to app.services.encryption_service.
"""

from app.services.encryption_service import (
    get_master_kek,
    generate_dek,
    wrap_dek,
    unwrap_dek,
    rotate_dek,
    encrypt_file_data,
    decrypt_file_data,
    EncryptionService,
    encryption_service,
    CURRENT_KEK_VERSION,
)

__all__ = [
    "get_master_kek",
    "generate_dek",
    "wrap_dek",
    "unwrap_dek",
    "rotate_dek",
    "encrypt_file_data",
    "decrypt_file_data",
    "EncryptionService",
    "encryption_service",
    "CURRENT_KEK_VERSION",
]
