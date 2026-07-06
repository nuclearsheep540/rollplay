# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterSubclass(Base):
    """The subclass chosen for one of a character's classes — one row per class (B.1).

    ``class_code`` / ``subclass_code`` reference ruleset seed data (no FK); the unique
    constraint enforces one subclass per class.
    """

    __tablename__ = "character_subclasses"
    __table_args__ = (
        UniqueConstraint("character_id", "class_code", name="uq_character_subclass"),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    class_code = Column(String(50), nullable=False)
    subclass_code = Column(String(50), nullable=False)
    chosen_at_level = Column(Integer, nullable=False)

    character = relationship("Character", back_populates="subclass_entries")

    def __repr__(self):
        return (
            f"<CharacterSubclass(character_id={self.character_id}, "
            f"class_code='{self.class_code}', subclass_code='{self.subclass_code}')>"
        )
