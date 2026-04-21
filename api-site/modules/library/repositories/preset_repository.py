# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Preset Repository — persistence for PresetAggregate.
"""

import logging
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session as DbSession

from modules.library.domain.preset_aggregate import PresetAggregate, PresetSlot
from modules.library.model.preset_model import PresetModel

logger = logging.getLogger(__name__)


class PresetRepository:
    """Data access for presets. Inline ORM ↔ aggregate conversion."""

    def __init__(self, db_session: DbSession):
        self.db = db_session

    def get_by_id(self, preset_id: UUID) -> Optional[PresetAggregate]:
        model = self.db.query(PresetModel).filter(PresetModel.id == preset_id).first()
        if not model:
            return None
        return self._model_to_aggregate(model)

    def list_for_user(self, user_id: UUID) -> List[PresetAggregate]:
        models = (
            self.db.query(PresetModel)
            .filter(PresetModel.user_id == user_id)
            .order_by(PresetModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(m) for m in models]

    def name_exists_for_user(self, user_id: UUID, name: str, exclude_id: Optional[UUID] = None) -> bool:
        """Check whether a preset name is already taken by this user."""
        q = self.db.query(PresetModel).filter(
            PresetModel.user_id == user_id,
            PresetModel.name == name,
        )
        if exclude_id is not None:
            q = q.filter(PresetModel.id != exclude_id)
        return self.db.query(q.exists()).scalar()

    def save(self, preset: PresetAggregate) -> PresetAggregate:
        """Upsert a preset. Returns the saved aggregate (re-read)."""
        existing = self.db.query(PresetModel).filter(PresetModel.id == preset.id).first()
        serialised_slots = self._slots_to_json(preset.slots)

        if existing:
            existing.name = preset.name
            existing.slots = serialised_slots
            # updated_at handled by server (onupdate=func.now())
        else:
            model = PresetModel(
                id=preset.id,
                user_id=preset.user_id,
                name=preset.name,
                slots=serialised_slots,
            )
            self.db.add(model)

        self.db.commit()
        self.db.refresh(existing if existing else model)
        saved = existing if existing else model
        return self._model_to_aggregate(saved)

    def delete(self, preset_id: UUID) -> bool:
        model = self.db.query(PresetModel).filter(PresetModel.id == preset_id).first()
        if not model:
            return False
        self.db.delete(model)
        self.db.commit()
        return True

    # ── Conversion ──────────────────────────────────────────────────────────
    def _model_to_aggregate(self, model: PresetModel) -> PresetAggregate:
        slots = [
            PresetSlot(
                channel_id=entry["channel_id"],
                music_asset_id=UUID(entry["music_asset_id"]),
            )
            for entry in (model.slots or [])
        ]
        return PresetAggregate.from_persistence(
            id=model.id,
            user_id=model.user_id,
            name=model.name,
            slots=slots,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )

    @staticmethod
    def _slots_to_json(slots: List[PresetSlot]) -> list:
        return [
            {"channel_id": s.channel_id, "music_asset_id": str(s.music_asset_id)}
            for s in slots
        ]
