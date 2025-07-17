# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Boolean, JSON, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from models.base import Base
from enums.game_status import GameStatus

class Game(Base):
    __tablename__ = "games"
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey("campaigns.id"))
    name = Column(String, nullable=True)  # Game instance name
    dm_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Game lifecycle
    status = Column(Enum('inactive', 'starting', 'active', 'stopping', name='gamestatus'))
    
    # Game state (persisted from hot storage)
    location = Column(String, nullable=True)  # Current in-game location
    party = Column(JSON, default=list)  # List of user_ids who actually played in this game session
    max_players = Column(Integer, default=8)
    adventure_logs = Column(JSON, default=list)  # Chat messages, dice rolls, system events from this game session
    combat_active = Column(Boolean, default=False)  # Whether combat is currently active
    turn_order = Column(JSON, default=list)  # Initiative order for combat turns
    
    # Session tracking
    current_session_number = Column(Integer, default=1)
    total_play_time = Column(Integer, default=0)  # Total minutes played
    started_at = Column(DateTime, nullable=True)
    ended_at = Column(DateTime, nullable=True)
    last_activity_at = Column(DateTime, default=datetime.utcnow)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    campaign = relationship("Campaign", back_populates="games")
    dm = relationship("User", foreign_keys=[dm_id])