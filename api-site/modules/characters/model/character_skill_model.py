# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Boolean, Column, ForeignKey, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterSkillProficiency(Base):
    """Skill proficiency entry — one row per (character, skill) pair.

    ``source`` tracks where the proficiency came from for auditability and to
    support feature removal at level-down (CLASS / BACKGROUND / FEAT / SPECIES).
    ``expertise=True`` doubles the prof bonus contribution in the ruleset math.
    """

    __tablename__ = "character_skill_proficiencies"
    __table_args__ = (
        UniqueConstraint("character_id", "skill_code", name="uq_character_skill"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    skill_code = Column(String(50), nullable=False)
    source = Column(String(20), nullable=False)
    expertise = Column(Boolean, nullable=False, default=False, server_default="false")

    character = relationship("Character", back_populates="skill_entries")

    def __repr__(self):
        return (
            f"<CharacterSkillProficiency(character_id={self.character_id}, "
            f"skill_code='{self.skill_code}', source='{self.source}')>"
        )
