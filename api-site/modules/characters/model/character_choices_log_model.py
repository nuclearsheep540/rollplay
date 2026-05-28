# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterChoiceLog(Base):
    """Append-only audit trail of decisions made during character creation and level-up.

    ``choice_type`` examples: ASI, FEAT, SKILL, HP_ROLL, ABILITY_INCREASE.
    ``choice_data`` is a free-form JSONB payload — the structure depends on
    ``choice_type``, e.g. an ASI row carries
    ``{"abilities": {"strength": 2}}`` or ``{"abilities": {"str": 1, "con": 1}}``.
    """

    __tablename__ = "character_choices_log"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    level = Column(Integer, nullable=False)
    choice_type = Column(String(30), nullable=False)
    choice_data = Column(JSONB, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False)

    character = relationship("Character", back_populates="choice_log_entries")

    def __repr__(self):
        return (
            f"<CharacterChoiceLog(character_id={self.character_id}, "
            f"level={self.level}, type='{self.choice_type}')>"
        )
