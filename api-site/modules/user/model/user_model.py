# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from datetime import datetime
from uuid import uuid4
from shared.dependencies.db import Base

class User(Base):
    """
    SQLAlchemy ORM model for users table.
    
    This is the data layer representation - keep separate from domain logic.
    Use UserMapper to convert between this and UserAggregate.
    """
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, unique=True, nullable=False, index=True)
    screen_name = Column(String, nullable=True)  # Added missing field from database
    account_name = Column(String(20), nullable=True)  # Immutable username for friend lookups
    account_tag = Column(String(4), nullable=True)  # 4-digit discriminator (e.g., "2345")
    created_at = Column(DateTime, default=datetime.utcnow, nullable=False)
    last_login = Column(DateTime, nullable=True)
    
    # Relationships (for ORM convenience, not exposed to domain)
    campaigns = relationship("Campaign", back_populates="host")  # UPDATED from "dm"
    games = relationship("Game", back_populates="host")  # UPDATED from "dungeon_master"
    
    def __repr__(self):
        return "<User {}>".format(self.email)