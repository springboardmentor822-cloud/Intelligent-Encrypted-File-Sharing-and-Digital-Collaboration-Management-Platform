\# TrustShare Backend Setup Guide



\## 1. Overview



The TrustShare backend is developed using Python and FastAPI. It provides REST APIs for authentication, file management, encryption, sharing, audit logging, and administrative monitoring.



\## 2. Technology Stack



| Technology | Purpose |

|---|---|

| Python | Backend programming |

| FastAPI | REST API framework |

| Uvicorn | ASGI server |

| SQLAlchemy | Database ORM |

| PostgreSQL | Relational database |

| PyMongo | MongoDB integration |

| Redis | Caching and supporting operations |

| Cryptography | AES-GCM encryption |

| pwdlib with Argon2 | Password hashing |

| python-jose | JWT authentication support |

| Boto3 | S3-compatible storage SDK |

| python-dotenv | Environment configuration |



\## 3. Backend Dependencies



Dependencies are maintained in the root `requirements.txt` file.



Install them using:



```powershell

pip install -r requirements.txt

```



The dependency list includes:



\- fastapi

\- uvicorn\[standard]

\- sqlalchemy

\- email-validator

\- pwdlib\[argon2]

\- python-jose\[cryptography]

\- python-dotenv

\- python-multipart

\- psycopg\[binary]

\- pymongo

\- redis

\- cryptography

\- boto3



\## 4. Project Structure



```text

app/

├── config.py

├── database.py

├── init.py

├── models.py

├── routes.py

├── schemas.py

├── security.py

│

└── services/

&#x20;   ├── encryption\_service.py

&#x20;   ├── key\_management\_service.py

&#x20;   ├── mongodb\_service.py

&#x20;   ├── redis\_service.py

&#x20;   └── storage\_service.py



main.py

requirements.txt

Dockerfile

compose.yaml

```



\## 5. Backend Configuration



The application uses environment variables stored in the root `.env` file.



Configuration includes:



\- PostgreSQL connection URL.

\- MongoDB connection URL.

\- Redis connection URL.

\- Master encryption key.

\- RustFS access credentials.

\- PostgreSQL credentials.



Never commit `.env` to a public repository.



\## 6. Running Through Docker



The recommended project execution method is Docker Compose.



Build and start services:



```powershell

docker compose up -d --build

```



Check services:



```powershell

docker compose ps

```



View backend logs:



```powershell

docker compose logs -f backend

```



\## 7. API Access



Backend base URL:



http://localhost:8000



Swagger documentation:



http://localhost:8000/docs



Alternative API documentation:



http://localhost:8000/redoc



\## 8. Main Backend Modules



\### config.py

Loads application configuration and environment variables.



\### database.py

Handles database connectivity and SQLAlchemy integration.



\### models.py

Defines database models.



\### schemas.py

Defines request and response schemas.



\### routes.py

Contains API route implementations.



\### security.py

Handles security-related operations.



\### encryption\_service.py

Implements file encryption and decryption operations.



\### key\_management\_service.py

Handles encryption key management and versioning.



\### mongodb\_service.py

Provides MongoDB integration.



\### redis\_service.py

Provides Redis integration.



\### storage\_service.py

Handles object storage operations.



\## 9. Development Notes



\- Keep secrets outside source code.

\- Use environment variables for deployment configuration.

\- Keep encryption and key-management operations separate from API route handlers.

\- Validate uploaded files and API requests.

\- Preserve database and object-storage volumes during routine updates.



\## 10. License



Refer to the root project's LICENSE file.
