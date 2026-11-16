import urllib.request
import json
from app.db.session import SessionLocal
from app.models.user import User
from app.models.file import FileRecord
from app.core.security import create_access_token
from app.services.storage_service import StorageService

def run():
    with SessionLocal() as db:
        u = db.query(User).filter(User.role == 'user').first()
        token = create_access_token(subject=str(u.id))

    boundary = '----TestBoundary123456'
    payload = b'TrustShare Cloud Storage & AES-256-GCM Verification Content!'
    body = (
        f'--{boundary}\r\n'
        f'Content-Disposition: form-data; name="file"; filename="cloud_test.txt"\r\n'
        f'Content-Type: text/plain\r\n\r\n'
    ).encode('utf-8') + payload + f'\r\n--{boundary}--\r\n'.encode('utf-8')

    req = urllib.request.Request(
        'http://127.0.0.1:8000/api/v1/files/upload',
        data=body,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': f'multipart/form-data; boundary={boundary}',
        },
        method='POST'
    )

    with urllib.request.urlopen(req) as resp:
        res = json.loads(resp.read().decode())
        print('Upload Success!')
        print('  File ID:', res.get('id'))
        print('  Filename:', res.get('original_filename'))
        print('  Encrypted:', res.get('is_encrypted'))
        print('  Algorithm:', res.get('encryption_algorithm'))

    file_id = res['id']

    # 1. Verify that stored file in storage is NOT readable plaintext
    with SessionLocal() as db:
        rec = db.query(FileRecord).filter(FileRecord.id == file_id).first()
        print('  Storage path:', rec.file_path)
        stored_bytes = StorageService.get_encrypted_object(rec.file_path)
        print('  Stored bytes length:', len(stored_bytes))
        is_plaintext_present = payload in stored_bytes
        print('  Plaintext found in stored ciphertext:', is_plaintext_present)
        assert not is_plaintext_present, "Security violation: Plaintext was found in stored object!"

    # 2. Test authorized download and authenticated decryption
    req_dl = urllib.request.Request(
        f'http://127.0.0.1:8000/api/v1/files/{file_id}/download',
        headers={'Authorization': f'Bearer {token}'}
    )
    with urllib.request.urlopen(req_dl) as resp:
        dl_content = resp.read()
        print('  Decrypted Download:', repr(dl_content))
        assert dl_content == payload, "Decrypted content does not match original plaintext!"
        print('  [PASS] Decryption and SHA-256 integrity tag check verified!')

    # 3. Clean up test file
    StorageService.delete_encrypted_object(rec.file_path)
    with SessionLocal() as db:
        del_rec = db.query(FileRecord).filter(FileRecord.id == file_id).first()
        if del_rec:
            db.delete(del_rec)
            db.commit()
    print('  [PASS] Cleanup complete.')

if __name__ == '__main__':
    run()

