# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
CineConfig — Domain value object for cinematic image configuration.

Workshop-authored, read-only at runtime. Owns the visual overlay stack
and placeholder fields for future cine modules (transitions, ken burns,
text overlays).
"""

from dataclasses import dataclass, field
from typing import Any, List, Optional

from modules.library.domain.overlays import Overlay


@dataclass
class CineConfig:
    """Cinematic configuration value object owned by ImageAsset."""

    visual_overlays: List[Overlay] = field(default_factory=list)
    hide_player_ui: bool = True

    # Placeholders — future cine modules
    transition: Optional[Any] = None
    ken_burns: Optional[Any] = None
    text_overlays: Optional[Any] = None

    def validate(self) -> None:
        """Validate all overlays in the stack."""
        for overlay in self.visual_overlays:
            overlay.validate()

    def add_overlay(self, overlay: Overlay) -> None:
        """Add an overlay to the top of the stack."""
        overlay.validate()
        self.visual_overlays.append(overlay)

    def remove_overlay(self, index: int) -> None:
        """Remove an overlay by index."""
        if index < 0 or index >= len(self.visual_overlays):
            raise ValueError(f"Overlay index {index} out of range")
        self.visual_overlays.pop(index)

    def reorder_overlay(self, from_index: int, to_index: int) -> None:
        """Move an overlay from one position to another."""
        if from_index < 0 or from_index >= len(self.visual_overlays):
            raise ValueError(f"from_index {from_index} out of range")
        if to_index < 0 or to_index >= len(self.visual_overlays):
            raise ValueError(f"to_index {to_index} out of range")
        overlay = self.visual_overlays.pop(from_index)
        self.visual_overlays.insert(to_index, overlay)

    def has_content(self) -> bool:
        """Check if any cine module has meaningful content configured."""
        return (
            len(self.visual_overlays) > 0
            or self.transition is not None
            or self.ken_burns is not None
            or self.text_overlays is not None
        )

    def to_dict(self) -> dict:
        """Serialize to dict for JSONB storage."""
        return {
            "visual_overlays": [o.to_dict() for o in self.visual_overlays],
            "hide_player_ui": self.hide_player_ui,
            "transition": self.transition,
            "ken_burns": self.ken_burns,
            "text_overlays": self.text_overlays,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CineConfig":
        """Deserialize from JSONB dict."""
        overlays = [
            Overlay.from_dict(o) for o in data.get("visual_overlays", [])
        ]
        return cls(
            visual_overlays=overlays,
            hide_player_ui=data.get("hide_player_ui", True),
            transition=data.get("transition"),
            ken_burns=data.get("ken_burns"),
            text_overlays=data.get("text_overlays"),
        )
