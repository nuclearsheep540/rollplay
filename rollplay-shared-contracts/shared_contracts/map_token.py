# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""MapToken — one physical piece on the battle map.

Lives in `active_sessions.map_token_state` (hot, keyed per map asset_id) and
travels the session ETL as the same shape. `kind` is a rendering/default hint
only — never a permission class: anyone can move any token (ownership is
attribution, not ACL). Color and display name are derived at render time from
player_metadata, never stored here.
"""

from typing import Literal, Optional

from pydantic import Field

from .base import ContractModel


class MapToken(ContractModel):
    id: str = Field(..., min_length=1)  # uuid4 string, minted client-side at placement
    kind: Literal["pc", "npc"]
    owner_user_id: Optional[str] = None  # pc: the seated user; npc: None
    character_id: Optional[str] = None  # pc convenience ref; display still resolves live
    label: Optional[str] = Field(default=None, max_length=64)  # npc display name; pc fallback if owner absent (cap mirrors FogRegion.name)
    x: float = Field(..., allow_inf_nan=False)  # map-image-native px, center anchor
    y: float = Field(..., allow_inf_nan=False)
    footprint: int = Field(default=1, ge=1, le=4)  # cells per side (Medium=1 … Gargantuan=4)
    created_by: str = Field(..., min_length=1)  # user_id — server-stamped attribution
    updated_at: Optional[str] = None  # ISO-8601 with UTC offset, server-stamped per committed op
