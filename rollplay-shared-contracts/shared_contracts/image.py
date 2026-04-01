# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Image boundary schema for the ETL between api-site and api-game."""

from typing import Optional

from .base import ContractModel
from .cine import CineConfig


class ImageConfig(ContractModel):
    """Image state for ETL boundary."""

    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str  # Presigned S3 URL
    file_size: Optional[int] = None  # Size in bytes
    display_mode: str = "float"  # "float" | "wrap" | "letterbox" | "cine"
    aspect_ratio: Optional[str] = None  # e.g. "2.39:1", "16:9" — only for letterbox/cine
    image_position_x: Optional[float] = None  # 0–100%, position of image within frame
    image_position_y: Optional[float] = None  # 0–100%, position of image within frame
    cine_config: Optional[CineConfig] = None  # Workshop-authored, read-only at runtime
