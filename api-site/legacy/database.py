# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from config.database import SessionLocal

def get_db_session():
    """
    FastAPI dependency to provide database session.
    
    Creates a new database session for each request and ensures
    it's properly closed after the request completes.
    
    Yields:
        Session: SQLAlchemy database session
    """
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()