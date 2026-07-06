# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import uuid

from sqlalchemy import Column, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from shared.dependencies.db import Base


class CharacterSpell(Base):
    """A spell a character knows / has prepared — one row per selection.

    ``spell_level`` is 0 for cantrips, 1..9 for leveled spells. ``source`` tracks how the
    spell was gained (class_known / class_prepared / always_prepared / species / …) so the
    level-up flow can undo grants; ``granted_by`` records the originating class/feat/species
    code (so a multi-class caster attributes each spell), and ``casting_ability`` is the
    ability used for this spell's save DC / attack.

    No unique constraint: spells are replace-written from the aggregate on every save, and
    the aggregate (``learn_spell``) guarantees uniqueness — this deliberately avoids the
    duplicate-key class of bug the skill table's constraint caused.
    """

    __tablename__ = "character_spells"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    character_id = Column(
        UUID(as_uuid=True),
        ForeignKey("characters.id", ondelete="CASCADE"),
        nullable=False,
    )
    spell_code = Column(String(80), nullable=False)
    spell_level = Column(Integer, nullable=False)
    source = Column(String(20), nullable=False)
    granted_by = Column(String(50), nullable=False, default="", server_default="")
    casting_ability = Column(String(20), nullable=True)

    character = relationship("Character", back_populates="spell_entries")

    def __repr__(self):
        return (
            f"<CharacterSpell(character_id={self.character_id}, "
            f"spell_code='{self.spell_code}', source='{self.source}')>"
        )
