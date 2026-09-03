from sqlalchemy import create_engine
from sqlalchemy.engine import URL
from sqlalchemy.orm import declarative_base,sessionmaker
from .config import DB_HOST,DB_PORT,DB_USER,DB_PASSWORD,DB_NAME,DB_POOL_SIZE,DB_MAX_OVERFLOW,DB_POOL_TIMEOUT

url=URL.create("mysql+pymysql",username=DB_USER,password=DB_PASSWORD,host=DB_HOST,port=DB_PORT,database=DB_NAME)
engine=create_engine(
    url,
    pool_pre_ping=True,
    pool_recycle=1800,
    pool_size=DB_POOL_SIZE,
    max_overflow=DB_MAX_OVERFLOW,
    pool_timeout=DB_POOL_TIMEOUT,
)
SessionLocal=sessionmaker(bind=engine,autocommit=False,autoflush=False)
Base=declarative_base()

def get_db():
    db=SessionLocal()
    try:
        yield db
    finally:
        db.close()
