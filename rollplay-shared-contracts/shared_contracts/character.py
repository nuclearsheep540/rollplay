# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Shared character DTOs used at service boundaries."""

from typing import List

from .base import ContractModel


class PlayerCharacter(ContractModel):
    """Character metadata for a rostered player in session ETL."""

    user_id: str
    player_name: str
    character_id: str
    character_name: str
    character_class: List[str]
    character_race: str
    level: int
    hp_current: int
    hp_max: int
    ac: int