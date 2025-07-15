# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from .base import Base

class Game(Base):
    __tablename__ = "games"
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"))
    session_name = Column(String, nullable=True)
    status = Column(String, default="configured")  # configured, active, paused, completed
    
    # Game mechanics
    dm_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    player_ids = Column(JSON, default=list)  # List[UUID]
    moderator_ids = Column(JSON, default=list)  # List[UUID]
    max_players = Column(Integer, default=8)
    seat_colors = Column(JSON, default=dict)  # Dict[str, str]
    
    # Session tracking
    current_session_number = Column(Integer, default=1)
    session_started_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, default=datetime.utcnow)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="games")
    dm = relationship("User", foreign_keys=[dm_id])