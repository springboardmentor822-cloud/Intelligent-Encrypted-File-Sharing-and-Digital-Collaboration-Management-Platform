# Docker deployment

1. Install Docker Engine or Docker Desktop with the Compose plugin.
2. Copy `.env.example` to `.env` and replace `TRUSTSHARE_ADMIN_TOKEN` with a private value.
3. Start the production compose configuration:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d
   ```

4. Open `http://localhost:8080`; check the API at `http://localhost:8080/health`.
5. Stop the services with `docker compose -f docker-compose.yml -f docker-compose.prod.yml down`.

SQLite persists in the `trustshare-data` Docker volume. Back up that volume before upgrades or host maintenance. The current application does not provide production-grade user authentication, so deployment behind a trusted access layer is required for real user data.
