# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared character DTOs used at service boundaries."""

from typing import List, Optional

from .base import ContractModel


class DungeonMaster(ContractModel):
    """DM metadata for session ETL. No character fields — the DM runs the session, not a character."""

    user_id: str
    player_name: str
    campaign_role: str = "dm"


class PlayerCharacter(ContractModel):
    """Character metadata for a rostered player in session ETL."""

    user_id: str
    player_name: str
    campaign_role: str
    character_id: str
    character_name: str
    character_class: List[str]
    character_race: str
    level: int
    hp_current: int
    hp_max: int
    ac: int
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