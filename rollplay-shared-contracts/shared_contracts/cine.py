# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Cine boundary schemas for cinematic image configuration."""

from typing import Any, Dict, List, Optional

from pydantic import Field

from .base import ContractModel


class VisualOverlay(ContractModel):
    """A single visual overlay in the cine overlay stack.

    Overlays are typed + stacked: each entry is one effect type,
    and multiple entries combine in array order (first = bottom, last = top).

    Type-specific params live in the ``params`` dict:
      - film_grain: {} (no extra params — just enabled + opacity)
      - color_filter: { color: "#hex", blend_mode: "multiply"|"overlay"|"screen"|"color" }
    """

    type: str  # "film_grain" | "color_filter"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    params: Dict[str, Any] = {}  # Type-specific, interpreted by frontend


class CineConfig(ContractModel):
    """Structured cinematic configuration for image assets.

    Workshop-authored, read-only at runtime. Stored as JSONB on the
    image asset in PostgreSQL and passed through to api-game via ETL.
    """

    transition: Optional[Any] = None  # Placeholder — entrance effect
    ken_burns: Optional[Any] = None  # Placeholder — pan+zoom motion
    text_overlays: Optional[Any] = None  # Placeholder — animated text
    visual_overlays: List[VisualOverlay] = []
    hide_player_ui: bool = True
