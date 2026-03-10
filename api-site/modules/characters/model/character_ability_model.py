# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from shared.dependencies.db import Base


class CharacterAbilityScore(Base):
    """Join table storing a character's base ability scores (6 rows per character)."""
    __tablename__ = 'character_ability_scores'

    character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True)
    ability_id = Column(Integer, ForeignKey('dnd_abilities.id'), primary_key=True)
    score = Column(Integer, nullable=False)

    # Relationships
    character = relationship("Character", back_populates="ability_score_entries")
    dnd_ability = relationship("DndAbility")

    def __repr__(self):
        return f"<CharacterAbilityScore(character_id={self.character_id}, ability_id={self.ability_id}, score={self.score})>"


class CharacterOriginBonus(Base):
    """Join table storing D&D 2024 origin ability bonuses (sparse, 2-3 rows per character)."""
    __tablename__ = 'character_origin_bonuses'

    character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True)
    ability_id = Column(Integer, ForeignKey('dnd_abilities.id'), primary_key=True)
    bonus = Column(Integer, nullable=False)

    # Relationships
    character = relationship("Character", back_populates="origin_bonus_entries")
    dnd_ability = relationship("DndAbility")

    def __repr__(self):
        return f"<CharacterOriginBonus(character_id={self.character_id}, ability_id={self.ability_id}, bonus={self.bonus})>"
