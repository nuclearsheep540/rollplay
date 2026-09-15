# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Text, DateTime, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Campaign(Base):
    __tablename__ = 'campaigns'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String(100), nullable=False)
    description = Column(Text)
    hero_image = Column(String(255), nullable=True)
    hero_image_asset_id = Column(UUID(as_uuid=True), ForeignKey('media_assets.id', ondelete='SET NULL'), nullable=True)
    created_by = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    edition_id = Column(Integer, ForeignKey('editions.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # No onupdate: the aggregate owns this via update_timestamp(), so it moves
    # only when a command actually edits the campaign. Letting the ORM stamp it
    # meant unrelated writes (a session being created) read as an edit.
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    last_played_at = Column(DateTime(timezone=True), nullable=True)  # Stamped when a session goes live
    # Seats at the table (1-8). Read into the start payload every time a game
    # starts, so an edit during a live game applies to the next one.
    max_players = Column(Integer, nullable=False, server_default='8')
    # The system this campaign is played with — "D&D 5e", "Coriolis", something the GM
    # made up. A name for now; the system's own mechanics come later. NULL = not said.
    system_name = Column(String(80), nullable=True)
    # GM's working copy of the character config (a shared_contracts CharacterConfig).
    # NULL = never edited. Cleared by publish, which mints an immutable version row.
    character_config_draft = Column(JSONB, nullable=True)

    # Relationships
    sessions = relationship("Session", back_populates="campaign", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="campaigns")
    members = relationship("CampaignMember", back_populates="campaign", cascade="all, delete-orphan", passive_deletes=True)
    hero_image_asset = relationship("MediaAsset", foreign_keys=[hero_image_asset_id], lazy="joined")

    def __repr__(self):
        return f"<Campaign(id={self.id}, title='{self.title}', created_by={self.created_by})>"