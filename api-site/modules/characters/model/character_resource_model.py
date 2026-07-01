# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterResource(Base):
    """A class resource pool's spent count for one character — one row per used pool.

    ``current_value`` is uses consumed (the pool's max comes from the ruleset). Full pools are
    stored implicitly (no row); rows are replace-written from the aggregate on each save, and the
    aggregate guarantees one row per ``pool_code`` — so no unique constraint is needed (same
    rationale as character_spells).
    """

    __tablename__ = "character_resource_usage"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    pool_code = Column(String(40), nullable=False)
    current_value = Column(Integer, nullable=False, default=0, server_default="0")

    character = relationship("Character", back_populates="resource_entries")

    def __repr__(self):
        return (
            f"<CharacterResource(character_id={self.character_id}, "
            f"pool_code='{self.pool_code}', current_value={self.current_value})>"
        )
