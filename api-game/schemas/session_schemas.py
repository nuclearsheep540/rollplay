# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Local session schemas for api-game.

Boundary schemas (SessionStartPayload, SessionEndResponse, etc.) live in
the shared_contracts package. This module retains only api-game-local
request models that have no cross-service meaning.
"""

from typing import Dict, Optional

from pydantic import BaseModel, model_validator
from shared_contracts.character_config import CharacterConfig
from shared_contracts.components import ComponentValue


class SessionEndRequest(BaseModel):
    """Request to end a game and return its final state.

    game_id is the room id: api-site keys the game and the room by one
    identifier, so there is nothing else to address it by.
    """
    game_id: str


class PlayerCharacterUpdate(BaseModel):
    """Everything this room should know about one player, sent by api-site.

    Identity always; the character half optional. Absent means the player holds no
    character — a late joiner who has not built one, or a player just ejected from the
    party — which is what lets one call serve joining, ejecting and late-joiner sync.

    A copy of api-site's model of the same name. It is not a shared contract because it
    never crosses to the browser; the duplication is recorded in the plan's followups, to be
    promoted if a third consumer appears.
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
        """All or nothing: a character_id with no config is a half-built player, which is a
        malformed message rather than a partial update — accepting it would put someone in
        the room that nothing can render."""
        if self.character_id is None:
            if self.display_name or self.config_version_id or self.config or self.values:
                raise ValueError("character fields sent without a character_id")
            return self
        if self.display_name is None or self.config is None:
            raise ValueError("character_id requires display_name and config")
        return self


class ComponentValueBody(BaseModel):
    """Body of the one route that changes a component value during a game."""

    value: ComponentValue
