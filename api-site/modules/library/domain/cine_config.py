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
class HandHeldMotion:
    """Hand-held camera drift — constant looping motion through random waypoints."""

    enabled: bool = True
    track_points: int = 4
    distance: int = 10
    speed: int = 3
    x_bias: int = 0
    randomness: int = 0

    def validate(self) -> None:
        if not (2 <= self.track_points <= 30):
            raise ValueError(f"track_points must be 2–30, got {self.track_points}")
        if not (2 <= self.distance <= 20):
            raise ValueError(f"distance must be 2–20, got {self.distance}")
        if not (1 <= self.speed <= 15):
            raise ValueError(f"speed must be 1–15, got {self.speed}")
        if not (-100 <= self.x_bias <= 100):
            raise ValueError(f"x_bias must be -100–100, got {self.x_bias}")
        if not (0 <= self.randomness <= 100):
            raise ValueError(f"randomness must be 0–100, got {self.randomness}")

    def to_dict(self) -> dict:
        return {
            "enabled": self.enabled,
            "track_points": self.track_points,
            "distance": self.distance,
            "speed": self.speed,
            "x_bias": self.x_bias,
            "randomness": self.randomness,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "HandHeldMotion":
        return cls(
            enabled=data.get("enabled", True),
            track_points=data.get("track_points", 4),
            distance=data.get("distance", 10),
            speed=data.get("speed", 3),
            x_bias=data.get("x_bias", 0),
            randomness=data.get("randomness", 0),
        )


@dataclass
class MotionConfig:
    """Motion section — houses movement-based cine effects."""

    hand_held: Optional[HandHeldMotion] = None
    ken_burns: Optional[Any] = None  # Placeholder — future

    def validate(self) -> None:
        if self.hand_held is not None:
            self.hand_held.validate()

    def has_content(self) -> bool:
        return self.hand_held is not None or self.ken_burns is not None

    def to_dict(self) -> dict:
        return {
            "hand_held": self.hand_held.to_dict() if self.hand_held else None,
            "ken_burns": self.ken_burns,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "MotionConfig":
        hand_held_data = data.get("hand_held")
        return cls(
            hand_held=HandHeldMotion.from_dict(hand_held_data) if hand_held_data else None,
            ken_burns=data.get("ken_burns"),
        )


@dataclass
class CineConfig:
    """Cinematic configuration value object owned by ImageAsset."""

    visual_overlays: List[Overlay] = field(default_factory=list)
    hide_player_ui: bool = True

    motion: Optional[MotionConfig] = None

    # Placeholders — future cine modules
    transition: Optional[Any] = None
    text_overlays: Optional[Any] = None

    def validate(self) -> None:
        """Validate all overlays and motion config."""
        for overlay in self.visual_overlays:
            overlay.validate()
        if self.motion is not None:
            self.motion.validate()

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
            or (self.motion is not None and self.motion.has_content())
            or self.transition is not None
            or self.text_overlays is not None
        )

    def to_dict(self) -> dict:
        """Serialize to dict for JSONB storage."""
        return {
            "visual_overlays": [o.to_dict() for o in self.visual_overlays],
            "hide_player_ui": self.hide_player_ui,
            "motion": self.motion.to_dict() if self.motion else None,
            "transition": self.transition,
            "text_overlays": self.text_overlays,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "CineConfig":
        """Deserialize from JSONB dict."""
        overlays = [
            Overlay.from_dict(o) for o in data.get("visual_overlays", [])
        ]
        motion_data = data.get("motion")
        return cls(
            visual_overlays=overlays,
            hide_player_ui=data.get("hide_player_ui", True),
            motion=MotionConfig.from_dict(motion_data) if motion_data else None,
            transition=data.get("transition"),
            text_overlays=data.get("text_overlays"),
        )
