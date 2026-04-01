# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Character(Base):
    __tablename__ = 'characters'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    character_name = Column(String(50), nullable=False)
    character_race = Column(String(50), nullable=False)
    level = Column(Integer, default=1, nullable=False)
    background = Column(String(50), nullable=True)  # D&D 2024: Character background
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)  # Soft delete flag
    active_campaign = Column('active_in_campaign_id', UUID(as_uuid=True), ForeignKey('campaigns.id', ondelete='SET NULL'), nullable=True)  # Campaign character is locked to
    hp_max = Column(Integer, default=10, nullable=False)
    hp_current = Column(Integer, default=10, nullable=False)
    ac = Column(Integer, default=10, nullable=False)
    is_alive = Column(Boolean, default=True, nullable=False)  # Character alive status

    # Relationships to normalized join tables
    class_entries = relationship("CharacterClassEntry", back_populates="character", cascade="all, delete-orphan", passive_deletes=True)
    ability_score_entries = relationship("CharacterAbilityScore", back_populates="character", cascade="all, delete-orphan", passive_deletes=True)

    def __repr__(self):
        classes_str = ', '.join([f"{e.dnd_class.name} {e.level}" for e in (self.class_entries or [])]) if self.class_entries else ''
        return f"<Character(id={self.id}, name='{self.character_name}', classes='{classes_str}', level={self.level})>"