# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Boolean, Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterClassEntry(Base):
    """Multi-class entry — one row per class the character has levels in.

    ``class_code`` references a class defined in the JSON seed data
    (e.g. ``"barbarian"``); there is no FK target because class content lives
    outside the DB in the ruleset registry.
    """

    __tablename__ = "character_class_entries"
    __table_args__ = (
        UniqueConstraint("character_id", "class_code", name="uq_character_class"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    class_code = Column(String(50), nullable=False)
    level = Column(Integer, nullable=False)
    is_primary = Column(Boolean, nullable=False, default=False, server_default="false")
    sub_choices = Column(JSONB, nullable=False, server_default="{}")  # L1 feature-choice picks

    character = relationship("Character", back_populates="class_entries")

    def __repr__(self):
        return (
            f"<CharacterClassEntry(character_id={self.character_id}, "
            f"class_code='{self.class_code}', level={self.level})>"
        )
