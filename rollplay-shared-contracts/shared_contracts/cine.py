# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Cine boundary schemas for cinematic image configuration.

Thin ETL layer mirroring the domain value objects in
api-site/modules/library/domain/. No business logic here —
just the serialization shape for the api-site ↔ api-game boundary.
"""

from typing import Annotated, Any, List, Literal, Optional, Union

from pydantic import Field

from .base import ContractModel


class FilmGrainOverlay(ContractModel):
    """Film grain overlay — animated texture over the image."""

    type: Literal["film_grain"] = "film_grain"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    style: str = "vintage"  # "vintage" | "grain"
    blend_mode: str = "overlay"


class ColorFilterOverlay(ContractModel):
    """Color filter overlay — solid color with blend mode."""

    type: Literal["color_filter"] = "color_filter"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    color: str = "#1a0a2e"
    blend_mode: str = "multiply"


VisualOverlay = Annotated[
    Union[FilmGrainOverlay, ColorFilterOverlay],
    Field(discriminator="type"),
]


class CineConfig(ContractModel):
    """Structured cinematic configuration for image assets.

    Workshop-authored, read-only at runtime. Passed through
    to api-game via ETL on the ImageConfig contract.
    """

    visual_overlays: List[VisualOverlay] = []
    hide_player_ui: bool = True
    transition: Optional[Any] = None  # Placeholder
    ken_burns: Optional[Any] = None  # Placeholder
    text_overlays: Optional[Any] = None  # Placeholder
