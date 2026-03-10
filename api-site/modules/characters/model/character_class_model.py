# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, Integer, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from shared.dependencies.db import Base


class CharacterClassEntry(Base):
    """Join table linking characters to their D&D classes with level."""
    __tablename__ = 'character_classes'

    character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True)
    class_id = Column(Integer, ForeignKey('dnd_classes.id'), primary_key=True)
    level = Column(Integer, nullable=False)

    # Relationships
    character = relationship("Character", back_populates="class_entries")
    dnd_class = relationship("DndClass")

    def __repr__(self):
        return f"<CharacterClassEntry(character_id={self.character_id}, class_id={self.class_id}, level={self.level})>"
