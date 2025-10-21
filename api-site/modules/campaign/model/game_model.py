# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Game(Base):
    __tablename__ = 'games'
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=False)
    dungeon_master_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    status = Column(String(20), default='INACTIVE', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True))
    stopped_at = Column(DateTime(timezone=True))
    session_id = Column(String(100))
    invited_users = 
    player_characters =
    
    # Relationships
    campaign = relationship("Campaign", back_populates="games")
    dungeon_master = relationship("User", back_populates="games")
    
    def __repr__(self):
        return f"<Game(id={self.id}, name='{self.name}', campaign_id={self.campaign_id}, status='{self.status}')>"