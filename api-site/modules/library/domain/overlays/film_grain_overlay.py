# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
FilmGrainOverlay — Animated film grain texture overlay.

Renders a grain texture GIF over the image. The `style` field selects
which grain asset to use (mapped to a static file by the frontend).
"""

from dataclasses import dataclass

from .overlay import Overlay


VALID_GRAIN_BLEND_MODES = {"overlay", "screen", "soft-light", "multiply", "luminosity"}
VALID_GRAIN_STYLES = {"vintage", "grain", "light_particles", "lens_flare_leak", "bokeh_light_glow", "sun_glow"}


@dataclass
class FilmGrainOverlay(Overlay):
    """Film grain visual overlay with configurable style and blend mode."""

    type: str = "film_grain"
    style: str = "vintage"
    blend_mode: str = "overlay"

    def validate(self) -> None:
        super().validate()
        if self.type != "film_grain":
            raise ValueError(f"FilmGrainOverlay type must be 'film_grain', got '{self.type}'")
        if self.style not in VALID_GRAIN_STYLES:
            raise ValueError(f"style must be one of {VALID_GRAIN_STYLES}, got '{self.style}'")
        if self.blend_mode not in VALID_GRAIN_BLEND_MODES:
            raise ValueError(f"blend_mode must be one of {VALID_GRAIN_BLEND_MODES}, got '{self.blend_mode}'")

    def to_dict(self) -> dict:
        base = super().to_dict()
        base["style"] = self.style
        base["blend_mode"] = self.blend_mode
        return base

    @classmethod
    def from_dict(cls, data: dict) -> "FilmGrainOverlay":
        return cls(
            type=data.get("type", "film_grain"),
            enabled=data.get("enabled", True),
            opacity=data.get("opacity", 0.5),
            style=data.get("style", "vintage"),
            blend_mode=data.get("blend_mode", "overlay"),
        )
