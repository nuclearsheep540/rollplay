# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from shared.dependencies.db import Base


class CharacterAbilityScore(Base):
    """
    Join table storing a character's ability scores and origin bonuses.

    Each character has exactly 6 rows (one per ability).
    origin_bonus defaults to 0 for most abilities — only 2-3 will have non-zero values.
    """
    __tablename__ = 'character_ability_scores'

    character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True)
    ability_id = Column(Integer, ForeignKey('dnd_abilities.id'), primary_key=True)
    score = Column(Integer, nullable=False)
    origin_bonus = Column(Integer, nullable=False, default=0, server_default='0')

    # Relationships
    character = relationship("Character", back_populates="ability_score_entries")
    dnd_ability = relationship("DndAbility")

    def __repr__(self):
        return f"<CharacterAbilityScore(character_id={self.character_id}, ability_id={self.ability_id}, score={self.score}, origin_bonus={self.origin_bonus})>"
