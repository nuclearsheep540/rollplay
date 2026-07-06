# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterInventoryItem(Base):
    """One inventory line for a character (J.3). ``item_code`` references the item catalogue
    (no FK — catalogue lives in the ruleset registry). ``notes`` is a free-text escape hatch.

    No unique constraint: rows are replace-written from the aggregate on every save, and the
    aggregate keeps one row per item_code (same rationale as character_spells).
    """

    __tablename__ = "character_inventory"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    item_code = Column(String(80), nullable=False)
    quantity = Column(Integer, nullable=False, default=1, server_default="1")
    notes = Column(Text, nullable=False, default="", server_default="")

    character = relationship("Character", back_populates="inventory_entries")

    def __repr__(self):
        return (
            f"<CharacterInventoryItem(character_id={self.character_id}, "
            f"item_code='{self.item_code}', quantity={self.quantity})>"
        )
