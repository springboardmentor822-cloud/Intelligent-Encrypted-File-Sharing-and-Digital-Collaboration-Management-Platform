# TrustShare
**Deployed and running at:** https://trustshare-lime.vercel.app/

**Admin Gate at:** https://trustshare-lime.vercel.app/admin/login


**A secure file sharing platform**:
Strong File security provided as files are encrypted with AES-256-GCM per-file data key wrapped by a versioned master key before reaching storage.


## Quick start 
Requires Python 3.11+.

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1         
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```
```powershell
cd frontend
npm install
npm run dev                           
```

## What's new in this build
- **Admin(password-gated admin entry for any account)**:  Opening it shows a restricted-area password gate, only people who know the admin-visit password can proceed. On success the server issues a 60-minute scoped grant bound to that user id, which the UI stores in sessionStorage only.

- **Encryption & Key Registry in the Security Dashboard**: Live document view of the envelope encryption state: algorithm (AES-256-GCM), 256-bit data keys, 96-bit nonces, KEK version per file, a non-reversible DEK fingerprint, wrapped-DEK size, key status, and last access.

- **Live threat LED & abnormal-activity triggers**: The Security Dashboard header carries a pulsing red LED with an open-alert count.  Triggers include: failed login, unknown-email login, brute-force bursts, successful sign-in from a new IP, wrong share passcode, failed vault unlock, abnormal download volume, decryption/integrity failure, and failed Admin Visit password.

- **Clean UI/UX**: Deep blue, lavender gradient system, gradient photography on the landing/auth/share pages, glass style panels, gradient imagery, and a consistent component design. Charts and graphs use a dark red colour palette.

- **Passcode-protected shares**: Link-based or direct shares with an optional 4–64 character passcode. Recipients must verify the passcode before accessing the file. Incorrect attempts are rate-limited, recorded, and flagged as security alerts.

- **Secure Folder (per user)**: A private vault for each user. Users can create a vault password and unlock the folder to upload, preview, download, and move files in and out.

- **Per-file encryption keys**: Every file receives a unique AES-256-GCM data encryption key (DEK). The versioned master key (KEK) wraps the DEK instead of directly encrypting file contents. Encryption keys are managed separately from stored ciphertext. Key rotation re-wraps the data keys without re-encrypting the files. Each file ID is also used as Additional Authenticated Data (AAD) to prevent ciphertext from being swapped between files.

