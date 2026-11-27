# Architecture

TrustShare Milestone 3 is split into two services:

- `frontend/` builds a React dashboard served as static files by Nginx.
- `backend/` runs a FastAPI service and stores activity, audit, notification, file, and security records in SQLite.

In Docker Compose, Nginx serves the dashboard on port 8080 and proxies API paths (including `/health` and `/docs`) to the API container. SQLite is stored in the `trustshare-data` named volume. On first startup the API creates its tables and adds illustrative demo data.

The browser dashboard currently uses local demo data and does not make API requests. `POST /activities` is the integration point for a future authenticated file-sharing application: send it an event only after the calling workflow has verified the user's identity and operation.

## Trust boundaries

The API is a demonstration integration surface. The optional admin token covers only administrator routes, and activity ingestion and notification routes have no user authentication. Do not expose the service publicly until trusted authentication, authorization, input ownership checks, and deployment secrets are configured.
