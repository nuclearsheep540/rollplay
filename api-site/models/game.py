# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Text
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from .base import Base

class Game(Base):
    __tablename__ = "games"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    dm_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    created_at = Column(DateTime, default=datetime.utcnow)
    status = Column(String, default="active")  # active, paused, completed
    
    # Game settings
    max_players = Column(Integer, default=6)
    description = Column(Text)
    
    # Relationships
    dm = relationship("User", foreign_keys=[dm_id])
    players = relationship("GamePlayers", back_populates="game")