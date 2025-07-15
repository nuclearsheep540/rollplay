# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Boolean, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from .base import Base

class GamePlayers(Base):
    __tablename__ = "game_players"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    game_id = Column(UUID(as_uuid=True), ForeignKey("games.id"))
    character_id = Column(UUID(as_uuid=True), ForeignKey("characters.id"))
    joined_at = Column(DateTime, default=datetime.utcnow)
    is_active = Column(Boolean, default=True)  # For leaving/rejoining games
    
    # Relationships
    game = relationship("Game", back_populates="players")
    character = relationship("Character", back_populates="game_participations")