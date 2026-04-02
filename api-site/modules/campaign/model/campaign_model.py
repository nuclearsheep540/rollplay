# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Text, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
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
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relationships
    sessions = relationship("Session", back_populates="campaign", cascade="all, delete-orphan")
    creator = relationship("User", back_populates="campaigns")
    members = relationship("CampaignMember", back_populates="campaign", cascade="all, delete-orphan", passive_deletes=True)
    hero_image_asset = relationship("MediaAsset", foreign_keys=[hero_image_asset_id], lazy="joined")

    def __repr__(self):
        return f"<Campaign(id={self.id}, title='{self.title}', created_by={self.created_by})>"