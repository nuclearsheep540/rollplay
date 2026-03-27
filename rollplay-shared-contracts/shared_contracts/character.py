# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared character DTOs used at service boundaries."""

from typing import List

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