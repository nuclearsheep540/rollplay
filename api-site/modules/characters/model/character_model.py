# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, Boolean, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Character(Base):
    __tablename__ = 'characters'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    character_name = Column(String(50), nullable=False)
    character_classes = Column(JSONB, nullable=False)  # Array of {class, level} objects
    character_race = Column(String(50), nullable=False)
    level = Column(Integer, default=1, nullable=False)
    stats = Column(JSONB, nullable=False, default=lambda: {})  # Ability scores (changed from JSON to JSONB)
    background = Column(String(50), nullable=True)  # D&D 2024: Character background
    origin_ability_bonuses = Column(JSONB, nullable=True, default=lambda: {})  # D&D 2024: Ability bonuses from background
    created_at = Column(DateTime(timezone=True), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now(), nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False)  # Soft delete flag
    active_campaign = Column('active_in_campaign_id', UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=True)  # Campaign character is locked to
    hp_max = Column(Integer, default=10, nullable=False)
    hp_current = Column(Integer, default=10, nullable=False)
    ac = Column(Integer, default=10, nullable=False)
    is_alive = Column(Boolean, default=True, nullable=False)  # Character alive status

    # No relationships - follow DDD principle of reference by ID only
    # Characters are referenced by Session via session_joined_users association table

    def __repr__(self):
        classes_str = ', '.join([f"{c['class']} {c['level']}" for c in (self.character_classes or [])])
        return f"<Character(id={self.id}, name='{self.character_name}', classes='{classes_str}', level={self.level})>"