# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://user:password@localhost/rollplay")

# Create engine
engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False} if "sqlite" in DATABASE_URL else {},
    poolclass=StaticPool if "sqlite" in DATABASE_URL else None,
)

# Create session factory
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Base class for models
Base = declarative_base()

def get_db():
    """
    Dependency to get database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Initialize database tables
    """
    Base.metadata.create_all(bind=engine)