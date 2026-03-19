# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Map and grid boundary schemas for the ETL between api-site and api-game."""

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class GridColorMode(BaseModel):
    """Color configuration for a single grid display mode (edit or display)."""

    line_color: str = "#d1d5db"
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    line_width: int = Field(default=1, ge=1, le=10)


class GridConfig(BaseModel):
    """Grid overlay configuration for a map."""

    grid_width: int = Field(default=20, ge=1, le=100)
    grid_height: int = Field(default=20, ge=1, le=100)
    enabled: bool = True
    colors: Optional[Dict[str, GridColorMode]] = None  # "edit_mode", "display_mode"
    offset_x: int = 0  # Whole-grid X shift (image px, can be negative)
    offset_y: int = 0  # Whole-grid Y shift (image px, can be negative)


class MapConfig(BaseModel):
    """Map state for ETL boundary (session start/end)."""

    asset_id: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1)
    original_filename: Optional[str] = None
    file_path: str = Field(..., min_length=1)  # Presigned S3 URL
    grid_config: Optional[GridConfig] = None
    map_image_config: Optional[Dict[str, Any]] = None  # Opaque to contracts, owned by frontend
