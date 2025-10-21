# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Campaign(Base):
    __tablename__ = 'campaigns'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(100), nullable=False)  # RENAMED from name
    description = Column(Text)
    host_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)  # RENAMED from dm_id
    assets = Column(JSON)  # RENAMED from maps, changed to JSON for structured metadata
    scenes = Column(JSON)  # NEW - scene management config
    npc_factory = Column(JSON)  # NEW - NPC generation config
    player_ids = Column(JSON, nullable=False, default=lambda: [])  # Array of player UUIDs
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    games = relationship("Game", back_populates="campaign", cascade="all, delete-orphan")
    host = relationship("User", back_populates="campaigns")  # RENAMED from dm

    def __repr__(self):
        return f"<Campaign(id={self.id}, title='{self.title}', host_id={self.host_id})>"