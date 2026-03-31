# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
FilmGrainOverlay — Animated film grain texture overlay.

Renders the static /cine/overlay/film-grain.gif asset over the image
with mix-blend-mode: overlay. The only configurable properties are
enabled and opacity (inherited from Overlay).
"""

from dataclasses import dataclass

from .overlay import Overlay


@dataclass
class FilmGrainOverlay(Overlay):
    """Film grain visual overlay. No extra params — just enabled + opacity."""

    type: str = "film_grain"

    def validate(self) -> None:
        super().validate()
        if self.type != "film_grain":
            raise ValueError(f"FilmGrainOverlay type must be 'film_grain', got '{self.type}'")

    @classmethod
    def from_dict(cls, data: dict) -> "FilmGrainOverlay":
        return cls(
            type=data.get("type", "film_grain"),
            enabled=data.get("enabled", True),
            opacity=data.get("opacity", 0.5),
        )
