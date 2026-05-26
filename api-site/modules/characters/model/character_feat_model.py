# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterFeatAcquisition(Base):
    """A feat the character has taken, with the level it was acquired at.

    ``source`` discriminates: BACKGROUND_ORIGIN (granted at creation) /
    ASI (chosen at an Ability Score Improvement level) / OTHER. The
    (character_id, feat_code, acquired_at_level) uniqueness lets a repeatable
    feat be taken more than once at different levels.
    """

    __tablename__ = "character_feat_acquisitions"
    __table_args__ = (
        UniqueConstraint(
            "character_id",
            "feat_code",
            "acquired_at_level",
            name="uq_character_feat_level",
        ),
    )

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    feat_code = Column(String(50), nullable=False)
    acquired_at_level = Column(Integer, nullable=False)
    source = Column(String(20), nullable=False)

    character = relationship("Character", back_populates="feat_entries")

    def __repr__(self):
        return (
            f"<CharacterFeatAcquisition(character_id={self.character_id}, "
            f"feat_code='{self.feat_code}', level={self.acquired_at_level})>"
        )
