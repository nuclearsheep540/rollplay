# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from .base import Base

class User(Base):
    __tablename__ = "users"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    email = Column(String, nullable=False, unique=True)  # Unique email for auth
    screen_name = Column(String, nullable=True, unique=True)  # Unique display name
    created_at = Column(DateTime, default=datetime.utcnow)
    last_login = Column(DateTime)
    temp_game_ids = Column(JSON, default=list)  # Temporary storage for game IDs created via api-game
    
    # Relationships
    characters = relationship("Character", back_populates="user")
    dm_games = relationship("Game", back_populates="dm")
    sent_friend_requests = relationship("Friendship", foreign_keys="Friendship.requester_id", back_populates="requester")
    received_friend_requests = relationship("Friendship", foreign_keys="Friendship.addressee_id", back_populates="addressee")