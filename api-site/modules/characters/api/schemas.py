# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character DTO declarations.

A character's shape is its campaign's decision, so these carry component values keyed by
component id and name no rule.
"""

from datetime import datetime
from typing import Dict, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, model_validator

from shared_contracts.character_config import CharacterConfig
from shared_contracts.components import ComponentValue


class EditionResponse(BaseModel):
    """One ruleset edition. Dormant as far as characters go — it serves the edition
    endpoints that will become the framework preset."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    version: str
    is_active: bool


class CharacterCreateRequest(BaseModel):
    session_id: UUID
    values: Dict[str, ComponentValue]


class UpdateComponentRequest(BaseModel):
    value: ComponentValue


class SetAliveRequest(BaseModel):
    is_alive: bool


class SetAvatarRequest(BaseModel):
    asset_id: Optional[UUID] = None


class CharacterResponse(BaseModel):
    """A character as its owner or its campaign's host sees it.

    Secret values are NOT stripped here: the only readers of this response are the owner
    and the host, both of whom may see them. api-game does the per-viewer filtering,
    because it is the only place a third player ever sees someone else's values.
    """

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    user_id: UUID
    campaign_id: Optional[UUID]
    session_id: Optional[UUID]
    config_version_id: Optional[UUID]
    config_snapshot: CharacterConfig
    values: Dict[str, ComponentValue]
    display_name: str
    is_alive: bool
    is_keepsake: bool
    slot: Optional[int]
    avatar_asset_id: Optional[UUID]
    avatar_focal_area: Optional[dict]
    color: Optional[str]
    created_at: datetime
    updated_at: datetime
    # Enrichment, filled by the helper in endpoints.py — not by this schema.
    avatar_url: Optional[str] = None
    campaign_title: Optional[str] = None


class CharacterRuntimeBundle(BaseModel):
    """What api-game needs to put a character into a running room without reading PostgreSQL.

    Always a real character. Contrast PlayerCharacterUpdate, which is the whole of a
    player's room state and whose character half is optional.
    """

    character_id: UUID
    user_id: UUID
    display_name: str
    color: Optional[str]
    avatar_asset_id: Optional[UUID]
    config_version_id: Optional[UUID]
    config: CharacterConfig
    values: Dict[str, ComponentValue]
    is_alive: bool


class PlayerCharacterUpdate(BaseModel):
    """Everything a room should know about one player.

    Identity always; character half present or absent. Absent means the player holds no
    character — a late joiner who has not built one, or a player who was just ejected.
    That is what lets one call serve joining, ejecting and late-joiner sync, and why there
    is no DELETE route.
    """

    user_id: str
    player_name: str
    campaign_role: str
    character_id: Optional[str] = None
    display_name: Optional[str] = None
    config_version_id: Optional[str] = None
    config: Optional[CharacterConfig] = None
    values: Dict[str, ComponentValue] = {}
    color: Optional[str] = None
    avatar_asset_id: Optional[str] = None

    @model_validator(mode="after")
    def check_character_half(self) -> "PlayerCharacterUpdate":
        """All or nothing. A character_id with no config is a half-built player, which is a
        malformed message rather than a partial update — accepting it would seat someone the
        room cannot render."""
        if self.character_id is None:
            if self.display_name or self.config_version_id or self.config or self.values:
                raise ValueError("character fields sent without a character_id")
            return self
        if self.display_name is None or self.config is None:
            raise ValueError("character_id requires display_name and config")
        return self
