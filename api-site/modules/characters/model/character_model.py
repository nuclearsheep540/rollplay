# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Character(Base):
    __tablename__ = 'characters'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    character_name = Column(String(50), nullable=False)
    character_class = Column(String(50), nullable=False)
    character_race = Column(String(50), nullable=False)
    level = Column(Integer, default=1, nullable=False)
    stats = Column(JSON, nullable=False, default=lambda: {})  # Character sheet data
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)  # Soft delete flag
    active_game = Column(UUID(as_uuid=True), ForeignKey('games.id'), nullable=True)  # Currently active game
    hp_max = Column(Integer, default=10, nullable=False)
    hp_current = Column(Integer, default=10, nullable=False)
    ac = Column(Integer, default=10, nullable=False)
    
    # No relationships - follow DDD principle of reference by ID only
    # Characters are referenced by Game via game_characters association table

    def __repr__(self):
        return f"<Character(id={self.id}, name='{self.character_name}', class='{self.character_class}', level={self.level})>"