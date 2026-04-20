# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Preset ORM Model — DM-scoped mixer preset (named collection of channel-slot
→ music-asset-id entries).

Slots are stored as a JSONB column rather than a child table: the list is
small (bounded by mixer channel count), only ever loaded/saved as a whole,
and never queried slot-by-slot. Matches the codebase's existing pragmatism
for list-valued fields (see MediaAsset.campaign_ids using ARRAY(UUID)).
"""

import uuid

from sqlalchemy import Column, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from shared.dependencies.db import Base


class PresetModel(Base):
    """
    Preset entity — DM's named mixer configuration.

    Constraints:
    - (user_id, name) is unique — no two presets of the same DM share a name.
    - user_id FK cascades on delete, so removing a user cleans up their presets.
    """
    __tablename__ = 'presets'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey('users.id', ondelete='CASCADE'),
        nullable=False,
        index=True,
    )
    name = Column(String(64), nullable=False)
    # List[{channel_id: str, music_asset_id: str}] — stored as JSONB for
    # simple bulk read/write. UUIDs serialised as strings at this layer.
    slots = Column(JSONB, nullable=False, default=list)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    owner = relationship("User", backref="presets")

    __table_args__ = (
        UniqueConstraint('user_id', 'name', name='uq_preset_user_name'),
    )

    def __repr__(self):
        slot_count = len(self.slots) if self.slots else 0
        return f"<Preset(id={self.id}, name='{self.name}', slots={slot_count})>"
