# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Image boundary schema for the ETL between api-site and api-game."""

from typing import List, Optional

from pydantic import field_validator

from .base import ContractModel
from .cine import MotionConfig, VisualOverlay


class ImageConfig(ContractModel):
    """Image state for ETL boundary."""

    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str  # Presigned S3 URL
    file_size: Optional[int] = None  # Size in bytes

    image_fit: str = "float"  # "float" | "wrap" | "letterbox"
    display_mode: str = "standard"  # "standard" | "cine"

    @field_validator('image_fit', mode='before')
    @classmethod
    def coerce_image_fit(cls, v):
        if v == "cine":
            return "letterbox"  # Legacy: old "cine" display_mode treated as letterbox
        return v if v is not None else "float"

    @field_validator('display_mode', mode='before')
    @classmethod
    def coerce_display_mode(cls, v):
        return v if v is not None else "standard"

    aspect_ratio: Optional[str] = None  # e.g. "2.39:1", "16:9" — only for letterbox
    image_position_x: Optional[float] = None  # 0–100%
    image_position_y: Optional[float] = None  # 0–100%

    # Visual effects — independent of display mode
    visual_overlays: Optional[List[VisualOverlay]] = None
    motion: Optional[MotionConfig] = None
