# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime
from uuid import UUID

from shared_contracts.character_config import CharacterConfig


@dataclass
class CharacterConfigVersionRecord:
    """Read model of one published version. Immutable; no behaviour beyond construction."""

    id: UUID
    campaign_id: UUID
    version: int
    config: CharacterConfig
    created_by: UUID
    created_at: datetime

    @classmethod
    def from_persistence(cls, model) -> "CharacterConfigVersionRecord":
        return cls(
            id=model.id,
            campaign_id=model.campaign_id,
            version=model.version,
            config=CharacterConfig.model_validate(model.config),
            created_by=model.created_by,
            created_at=model.created_at,
        )
