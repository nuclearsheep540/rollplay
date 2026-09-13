# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared character DTOs used at service boundaries.

A character is whatever its campaign's character config says it is, so these DTOs carry
component *values* keyed by component id and never name a rule. The config itself rides
once per version in SessionStartPayload.character_configs.

The class name DungeonMaster and the field dungeon_master are a cross-service rename that
is deliberately out of scope here (see the plan's followups); user-facing copy says "Game
Master" or "GM".
"""

from typing import Dict, Optional

from .base import ContractModel
from .components import ComponentValue


class DungeonMaster(ContractModel):
    """GM metadata for session ETL. No character fields — the GM runs the game, not a character."""

    user_id: str
    player_name: str
    campaign_role: str = "dm"


class PlayerCharacter(ContractModel):
    """Character metadata for a party member in game ETL.

    Carries identity plus the character's component values and the id of the config
    version that built them. No rules fields: api-game renders whatever the values are,
    by component type, and knows nothing about any game system.
    """

    user_id: str
    player_name: str
    campaign_role: str
    character_id: str
    display_name: str
    config_version_id: str
    # component_id -> value. The matching config is in
    # SessionStartPayload.character_configs[config_version_id].
    values: Dict[str, ComponentValue] = {}
    # Character-owned color (hex). The seat a player occupies *displays* this;
    # it is never stored per-seat. None = no custom color chosen yet.
    color: Optional[str] = None
    # Library image asset behind the character's avatar (tokens v3, decision
    # 30): pc map tokens derive their face from it. Rides the ETL so seats
    # can stamp it onto placed pc tokens; api-site resolves it into
    # SessionStartPayload.token_images at start. None = color disc.
    avatar_asset_id: Optional[str] = None


class SessionUser(ContractModel):
    """Any user who joined a session. Character data is optional —
    moderators and spectators participate without characters."""

    user_id: str
    player_name: str
    campaign_role: str
    character: Optional[PlayerCharacter] = None