# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, DateTime, ForeignKey, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID
from datetime import datetime
from uuid import uuid4
from .base import Base

class Campaign(Base):
    __tablename__ = "campaigns"
    
    # Core identity
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    name = Column(String, nullable=False)
    description = Column(String, nullable=True)
    dm_id = Column(UUID(as_uuid=True), ForeignKey("users.id"))
    status = Column(String, default="active")  # active, paused, completed
    
    # Soft delete
    deleted_at = Column(DateTime, nullable=True)
    is_deleted = Column(Boolean, default=False)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    games = relationship("Game", back_populates="campaign")
    maps = relationship("CampaignMap", back_populates="campaign")
    dm = relationship("User", foreign_keys=[dm_id])