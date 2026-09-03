import os
from dotenv import load_dotenv
load_dotenv()

DB_HOST=os.getenv("DB_HOST","127.0.0.1")
DB_PORT=int(os.getenv("DB_PORT","3306"))
DB_USER=os.getenv("DB_USER","root")
DB_PASSWORD=os.getenv("DB_PASSWORD","SqL3fOrU!")
DB_NAME=os.getenv("DB_NAME","voting_system")

DB_POOL_SIZE=int(os.getenv("DB_POOL_SIZE","20"))
DB_MAX_OVERFLOW=int(os.getenv("DB_MAX_OVERFLOW","4"))
DB_POOL_TIMEOUT=int(os.getenv("DB_POOL_TIMEOUT","5"))
SYNC_THREAD_LIMIT=int(os.getenv("SYNC_THREAD_LIMIT","16"))

API_DB_CONCURRENCY_LIMIT=int(os.getenv("API_DB_CONCURRENCY_LIMIT","12"))
LOGIN_ATTEMPT_TIMEZONE=os.getenv("LOGIN_ATTEMPT_TIMEZONE","Asia/Yangon").strip() or "Asia/Yangon"
BASE_URL=os.getenv("BASE_URL","http://127.0.0.1:8000").rstrip("/")
FRONTEND_URL=os.getenv("FRONTEND_URL","http://192.168.1.12:5174/").rstrip("/")
TOKEN_PEPPER=os.getenv("TOKEN_PEPPER","")
SESSION_SECRET=os.getenv("SESSION_SECRET","")
COOKIE_SECURE=os.getenv("COOKIE_SECURE","false").lower()=="true"
CORS_ORIGINS=[x.strip() for x in os.getenv("CORS_ORIGINS","http://localhost:5174,http://127.0.0.1:5174").split(",") if x.strip()]


PHOTO_STORAGE_PROVIDER=os.getenv("PHOTO_STORAGE_PROVIDER","local").lower()
LOCAL_UPLOAD_DIR=os.getenv("LOCAL_UPLOAD_DIR","uploads/candidates")
PUBLIC_UPLOAD_BASE_URL=os.getenv(
    "PUBLIC_UPLOAD_BASE_URL",
    f"{BASE_URL}/uploads/candidates"
).rstrip("/")
MAX_PHOTO_BYTES=int(os.getenv("MAX_PHOTO_BYTES",str(10*1024*1024)))


DEVELOPER_EMAIL=os.getenv("DEVELOPER_EMAIL","developer@example.com").strip().lower()
DEVELOPER_PASSWORD=os.getenv("DEVELOPER_PASSWORD","Developer123!")
