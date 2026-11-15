# OAuth2 in TrustShare

**What is OAuth2?** A standard way to log in. Instead of every app inventing its own login, they agree on a format
(tokens, "Bearer" headers). TrustShare supports it in two ways:

1. **Password flow (always on).** `POST /auth/token` with form fields `username` (your email) and `password`.
   It returns a token. The green **Authorize** button at http://localhost:8000/docs uses it. If MFA is on, add the form
   field `otp` (the Swagger button has no box for it; use `POST /auth/login` there).
2. **Google sign-in (optional).** Shows "Continue with Google" on the login page.

## Turning on Google sign-in
1. https://console.cloud.google.com → create a project → **APIs & Services → OAuth consent screen** (External, add yourself as a test user).
2. **Credentials → Create credentials → OAuth client ID → Web application**.
3. Authorized redirect URI: `http://localhost:8000/auth/oauth/google/callback`
4. Copy the client id and secret into `.env`:
   ```env
   GOOGLE_CLIENT_ID=...apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=...
   OAUTH_REDIRECT_BASE=http://localhost:8000
   ```
5. Restart the backend. The button appears.

## How the flow works (simple version)
1. Browser → `/auth/oauth/google/login` → backend sends you to Google with a random `state`.
2. You approve on Google → Google sends you back to `/auth/oauth/google/callback?code=…&state=…`.
3. Backend checks `state`, swaps `code` for your verified email, creates or finds your account, and issues TrustShare tokens.
4. Browser gets a **one-time code (valid 60 s)** and exchanges it at `/auth/oauth/exchange`, so tokens never sit in the address bar.

Simplified: accounts with two-factor login must use the password form; Google users get the normal `user` role.
