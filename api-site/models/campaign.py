# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from models.base import Base

class Campaign(Base):
    __tablename__ = "campaigns"
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    dm_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    
    # Campaign configuration (atomic state for hot/cold migration)
    invited_players = Column(JSON, default=list)  # List of invited user_ids with character assignments
    moderators = Column(JSON, default=list)  # List of user_ids with moderator permissions
    maps = Column(JSON, default=list)  # Aggregate: List of map_ids (serialized via repository layer)
    audio = Column(JSON, default=dict)  # Aggregate: Named audio configurations (serialized via repository layer)
    media = Column(JSON, default=dict)  # Aggregate: Static media for storytelling (serialized via repository layer)
    scenes = Column(JSON, default=dict)  # Aggregate: Preset collections of audio/media (serialized via repository layer)
    
    # Soft delete
    deleted_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relationships
    games = relationship("Game", back_populates="campaign")
    maps = relationship("CampaignMap", back_populates="campaign")
    dm = relationship("User", foreign_keys=[dm_id])