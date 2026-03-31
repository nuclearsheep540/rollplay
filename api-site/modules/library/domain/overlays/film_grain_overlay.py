# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
FilmGrainOverlay — Animated film grain texture overlay.

Renders the static /cine/overlay/film-grain.gif asset over the image
with a configurable CSS mix-blend-mode.
"""

from dataclasses import dataclass

from .overlay import Overlay


VALID_GRAIN_BLEND_MODES = {"overlay", "screen", "soft-light", "multiply", "luminosity"}


@dataclass
class FilmGrainOverlay(Overlay):
    """Film grain visual overlay with configurable blend mode."""

    type: str = "film_grain"
    blend_mode: str = "overlay"

    def validate(self) -> None:
        super().validate()
        if self.type != "film_grain":
            raise ValueError(f"FilmGrainOverlay type must be 'film_grain', got '{self.type}'")
        if self.blend_mode not in VALID_GRAIN_BLEND_MODES:
            raise ValueError(f"blend_mode must be one of {VALID_GRAIN_BLEND_MODES}, got '{self.blend_mode}'")

    def to_dict(self) -> dict:
        base = super().to_dict()
        base["blend_mode"] = self.blend_mode
        return base

    @classmethod
    def from_dict(cls, data: dict) -> "FilmGrainOverlay":
        return cls(
            type=data.get("type", "film_grain"),
            enabled=data.get("enabled", True),
            opacity=data.get("opacity", 0.5),
            blend_mode=data.get("blend_mode", "overlay"),
        )
