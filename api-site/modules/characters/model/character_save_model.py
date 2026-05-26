# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, ForeignKey, Integer
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterSaveProficiency(Base):
    """One row per ability the character has saving-throw proficiency in.

    Saving throw proficiencies are granted by class (typically 2 per class at
    level 1) and occasionally by feats. Existence of a row means proficient.
    """

    __tablename__ = "character_save_proficiencies"

    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        primary_key=True,
    )
    ability_id = Column(Integer, ForeignKey("dnd_abilities.id"), primary_key=True)

    character = relationship("Character", back_populates="save_proficiency_entries")
    dnd_ability = relationship("DndAbility")

    def __repr__(self):
        return (
            f"<CharacterSaveProficiency(character_id={self.character_id}, "
            f"ability_id={self.ability_id})>"
        )
