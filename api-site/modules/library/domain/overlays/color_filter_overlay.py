# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
ColorFilterOverlay — Solid color overlay with configurable blend mode.

Renders a full-frame div with a background color and CSS mix-blend-mode
over the image. Used for tints, washes, and colour grading effects.
"""

import re
from dataclasses import dataclass

from .overlay import Overlay


VALID_BLEND_MODES = {"multiply", "overlay", "screen", "color"}


@dataclass
class ColorFilterOverlay(Overlay):
    """Color filter visual overlay with color and blend mode."""

    type: str = "color_filter"
    color: str = "#1a0a2e"
    blend_mode: str = "multiply"

    def validate(self) -> None:
        super().validate()
        if self.type != "color_filter":
            raise ValueError(f"ColorFilterOverlay type must be 'color_filter', got '{self.type}'")
        if not re.match(r"^#[0-9a-fA-F]{6}$", self.color):
            raise ValueError(f"Color must be a 6-digit hex string (e.g. '#1a0a2e'), got '{self.color}'")
        if self.blend_mode not in VALID_BLEND_MODES:
            raise ValueError(f"blend_mode must be one of {VALID_BLEND_MODES}, got '{self.blend_mode}'")

    def to_dict(self) -> dict:
        base = super().to_dict()
        base["color"] = self.color
        base["blend_mode"] = self.blend_mode
        return base

    @classmethod
    def from_dict(cls, data: dict) -> "ColorFilterOverlay":
        return cls(
            type=data.get("type", "color_filter"),
            enabled=data.get("enabled", True),
            opacity=data.get("opacity", 0.5),
            color=data.get("color", "#1a0a2e"),
            blend_mode=data.get("blend_mode", "multiply"),
        )
