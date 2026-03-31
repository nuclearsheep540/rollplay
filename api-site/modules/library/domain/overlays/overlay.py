# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Overlay — Base value object for visual overlays.

All overlay types share enabled and opacity. Subclasses define
type-specific fields and validation.
"""

from dataclasses import dataclass


VALID_OVERLAY_TYPES = {"film_grain", "color_filter"}


@dataclass
class Overlay:
    """Base visual overlay value object."""

    type: str
    enabled: bool = True
    opacity: float = 0.5

    def validate(self) -> None:
        """Validate shared overlay fields. Subclasses extend this."""
        if self.type not in VALID_OVERLAY_TYPES:
            raise ValueError(f"Unknown overlay type: {self.type}. Must be one of {VALID_OVERLAY_TYPES}")
        if not 0.0 <= self.opacity <= 1.0:
            raise ValueError(f"Overlay opacity must be between 0.0 and 1.0, got {self.opacity}")

    def to_dict(self) -> dict:
        """Serialize to dict for JSONB storage. Subclasses extend this."""
        return {
            "type": self.type,
            "enabled": self.enabled,
            "opacity": self.opacity,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "Overlay":
        """Deserialize from dict. Dispatches to the correct subclass by type."""
        from .film_grain_overlay import FilmGrainOverlay
        from .color_filter_overlay import ColorFilterOverlay

        overlay_type = data.get("type")
        if overlay_type == "film_grain":
            return FilmGrainOverlay.from_dict(data)
        elif overlay_type == "color_filter":
            return ColorFilterOverlay.from_dict(data)
        else:
            raise ValueError(f"Unknown overlay type: {overlay_type}")
