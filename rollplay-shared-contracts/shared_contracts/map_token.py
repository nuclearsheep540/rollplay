# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""MapToken — one physical piece on the battle map.

Lives in `active_sessions.map_token_state` (hot, keyed per map asset_id) and
travels the session ETL as the same shape. Color and display name are derived
at render time from player_metadata, never stored here.

Movement rules (tokens v2, decision 16 — supersedes v1's "anyone moves any
token" for npc tokens only): pc tokens keep the open table-feel (anyone may
move them; attribution logs the social correction); npc tokens are the DM's
to place, move, remove, configure. `hidden` npc tokens must never reach
player clients (server-side per-recipient filtering, decision 17); `locked`
npc tokens refuse move/remove for everyone including the DM until unlocked
(decision 18). Both flags are npc-only — a hard data invariant, not a game
rule (decision 19).
"""

from typing import Literal, Optional

from pydantic import Field, model_validator

from .base import ContractModel
from .image import FocalArea


class MapToken(ContractModel):
    id: str = Field(..., min_length=1)  # uuid4 string, minted client-side at placement
    kind: Literal["pc", "npc"]
    owner_user_id: Optional[str] = None  # pc: the seated user; npc: DM-assigned controller (a player's minion/companion) or None for a plain DM token
    character_id: Optional[str] = None  # pc convenience ref; display still resolves live
    label: Optional[str] = Field(default=None, max_length=64)  # npc display name; pc fallback if owner absent (cap mirrors FogRegion.name)
    x: float = Field(..., allow_inf_nan=False)  # map-image-native px, center anchor
    y: float = Field(..., allow_inf_nan=False)
    footprint: int = Field(default=1, ge=1, le=4)  # cells per side (Medium=1 … Gargantuan=4)
    created_by: str = Field(..., min_length=1)  # user_id — server-stamped attribution
    updated_at: Optional[str] = None  # ISO-8601 with UTC offset, server-stamped per committed op
    hidden: bool = False  # npc-only: invisible to players, ghosted for the DM (decision 17)
    locked: bool = False  # npc-only: move/remove refused for everyone until unlocked (decision 18)
    image_asset_id: Optional[str] = None  # library image the disc renders (workshop-authored only, decision 27); crop = that image's focal_areas["token"]

    @model_validator(mode="after")
    def _pc_tokens_cannot_hide_or_lock(self) -> "MapToken":
        if self.kind == "pc" and (self.hidden or self.locked):
            raise ValueError("hidden/locked are npc-only flags (decision 19)")
        return self


class TokenImageRef(ContractModel):
    """Resolved delivery info for one token image at session start: a fresh
    signed URL plus the image's "token" focal area. The image set is fixed
    at start (images are workshop-only and the workshop hard-blocks during
    live sessions), so one payload-level dict covers the whole session."""

    url: Optional[str] = None  # signed URL; None degrades to the color disc client-side
    token_area: Optional[FocalArea] = None  # crop; None renders the full image centered
