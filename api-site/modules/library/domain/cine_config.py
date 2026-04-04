# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Motion domain value objects for image configuration.

HandHeldMotion and MotionConfig are stored directly on ImageAsset
as top-level JSONB fields (not wrapped in a CineConfig container).
"""

from dataclasses import dataclass
from typing import Any, Optional


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
    """Motion section — houses movement-based effects."""

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
