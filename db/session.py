"""
db/session.py — Database connection manager
============================================
INTERVIEW: "Same code works with SQLite locally and MySQL in production.
            You just change DATABASE_URL in .env — zero code changes."

SQLite  (demo):    DATABASE_URL=sqlite:///./treazy.db
MySQL   (prod):    DATABASE_URL=mysql+pymysql://user:pass@localhost/treazy_db
"""

import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv
from db.models import Base

load_dotenv()

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "sqlite:///./treazy.db"   # default: SQLite for local demo
)

# SQLite needs check_same_thread=False
connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
    echo=False,          # set True to see SQL queries in terminal
    pool_pre_ping=True,  # reconnect if MySQL drops the connection
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def init_db():
    """Create all tables. Safe to call multiple times."""
    Base.metadata.create_all(bind=engine)
    print("✅ Database tables ready")


def get_db():
    """FastAPI dependency — yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
