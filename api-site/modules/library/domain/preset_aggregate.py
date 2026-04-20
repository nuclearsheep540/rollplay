# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Preset Aggregate — a DM's saved mixer configuration.

A preset is a named collection of channel-slot → music-asset-id entries
that lets a DM prepare the in-game audio mixer with one click. Presets
are user-scoped (owned by the DM, reusable across all their campaigns).

The preset only stores *which asset plays where* — all playback config
(loop points, volume, effects) lives on the MusicAssetAggregate. Single
source of truth for audio config.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
from uuid import UUID, uuid4


MAX_NAME_LENGTH = 64
MAX_SLOTS_PER_PRESET = 16


@dataclass
class PresetSlot:
    """A single channel assignment within a preset."""
    channel_id: str
    music_asset_id: UUID


@dataclass
class PresetAggregate:
    """
    Preset aggregate — one DM's named mixer configuration.

    Invariants:
    - Name is 1-64 characters, non-empty after trim.
    - Channel IDs are unique within a preset (one asset per slot).
    - Slot count bounded by MAX_SLOTS_PER_PRESET.
    """
    id: UUID
    user_id: UUID
    name: str
    slots: List[PresetSlot] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: Optional[datetime] = None

    @classmethod
    def create(
        cls,
        user_id: UUID,
        name: str,
        slots: Optional[List[PresetSlot]] = None,
    ) -> "PresetAggregate":
        """Create a new preset. Validates name + slot shape."""
        normalized_name = cls._validate_name(name)
        normalized_slots = cls._validate_slots(slots or [])
        return cls(
            id=uuid4(),
            user_id=user_id,
            name=normalized_name,
            slots=normalized_slots,
            created_at=datetime.utcnow(),
            updated_at=None,
        )

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        user_id: UUID,
        name: str,
        slots: List[PresetSlot],
        created_at: datetime,
        updated_at: Optional[datetime],
    ) -> "PresetAggregate":
        """Rehydrate from repository — no validation, assumes stored data is valid."""
        return cls(
            id=id,
            user_id=user_id,
            name=name,
            slots=slots,
            created_at=created_at,
            updated_at=updated_at,
        )

    def rename(self, name: str) -> None:
        """Rename the preset. Raises on empty / too-long names."""
        self.name = self._validate_name(name)
        self.updated_at = datetime.utcnow()

    def set_slot(self, channel_id: str, music_asset_id: UUID) -> None:
        """Upsert a slot — replaces the entry for `channel_id` if present."""
        if not channel_id:
            raise ValueError("channel_id is required")
        new_slots = [s for s in self.slots if s.channel_id != channel_id]
        new_slots.append(PresetSlot(channel_id=channel_id, music_asset_id=music_asset_id))
        if len(new_slots) > MAX_SLOTS_PER_PRESET:
            raise ValueError(f"Preset cannot exceed {MAX_SLOTS_PER_PRESET} slots")
        self.slots = new_slots
        self.updated_at = datetime.utcnow()

    def clear_slot(self, channel_id: str) -> None:
        """Remove the slot assigned to `channel_id`, if any."""
        self.slots = [s for s in self.slots if s.channel_id != channel_id]
        self.updated_at = datetime.utcnow()

    def replace_slots(self, slots: List[PresetSlot]) -> None:
        """Bulk replace all slots — what the preset-editor Save button posts."""
        self.slots = self._validate_slots(slots)
        self.updated_at = datetime.utcnow()

    # ── Validation helpers ──────────────────────────────────────────────────
    @staticmethod
    def _validate_name(name: str) -> str:
        if name is None:
            raise ValueError("Preset name is required")
        normalized = name.strip()
        if not normalized:
            raise ValueError("Preset name cannot be empty")
        if len(normalized) > MAX_NAME_LENGTH:
            raise ValueError(f"Preset name too long (max {MAX_NAME_LENGTH} chars)")
        return normalized

    @staticmethod
    def _validate_slots(slots: List[PresetSlot]) -> List[PresetSlot]:
        if len(slots) > MAX_SLOTS_PER_PRESET:
            raise ValueError(f"Preset cannot exceed {MAX_SLOTS_PER_PRESET} slots")
        seen_channels = set()
        for slot in slots:
            if not slot.channel_id:
                raise ValueError("Each slot must have a channel_id")
            if slot.channel_id in seen_channels:
                raise ValueError(f"Duplicate channel_id '{slot.channel_id}' in preset")
            seen_channels.add(slot.channel_id)
        return list(slots)
