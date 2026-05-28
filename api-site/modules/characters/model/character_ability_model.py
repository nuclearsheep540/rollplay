# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterAbilityScore(Base):
    """One row per ability for each character — final score after origin bonuses."""

    __tablename__ = "character_ability_scores"

    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ability_id = Column(Integer, ForeignKey("dnd_abilities.id"), primary_key=True)
    score = Column(Integer, nullable=False)
    origin_bonus = Column(Integer, nullable=False, default=0, server_default="0")

    character = relationship("Character", back_populates="ability_score_entries")
    dnd_ability = relationship("DndAbility")

    def __repr__(self):
        return (
            f"<CharacterAbilityScore(character_id={self.character_id}, "
            f"ability_id={self.ability_id}, score={self.score})>"
        )
