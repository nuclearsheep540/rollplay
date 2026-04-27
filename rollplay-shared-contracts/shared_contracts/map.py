# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Map and grid boundary schemas for the ETL between api-site and api-game."""

from typing import Any, Dict, Optional

from pydantic import Field

from .base import ContractModel


class GridColorMode(ContractModel):
    """Color configuration for a single grid display mode (edit or display)."""

    line_color: str = "#d1d5db"
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    line_width: int = Field(default=1, ge=1, le=10)


class GridConfig(ContractModel):
    """Grid overlay configuration for a map."""

    grid_width: int = Field(default=20, ge=1, le=1000)
    grid_height: int = Field(default=20, ge=1, le=1000)
    enabled: bool = True
    colors: Optional[Dict[str, GridColorMode]] = None  # "edit_mode", "display_mode"
    offset_x: int = 0  # Whole-grid X shift (image px, can be negative)
    offset_y: int = 0  # Whole-grid Y shift (image px, can be negative)
    grid_cell_size: Optional[float] = None  # Absolute cell size in native image pixels; None = not yet tuned


class FogConfig(ContractModel):
    """Fog of war mask for a map.

    The mask is a base64-encoded PNG data URL (with the
    `data:image/png;base64,` prefix). Alpha channel is meaningful:
    opaque pixels are fog, transparent pixels are revealed. Complex
    fog shapes (holes, disconnected regions, soft edges) are
    encoded entirely in the per-pixel alpha pattern —
    mask_width/mask_height are just the rectangular bounds of the
    bitmap, not a geometric description.

    Resolution is chosen by the painter (typically 25–50% of the
    map's native dimensions); the renderer scales the mask to the
    map image's display size on the client.
    """

    mask: Optional[str] = Field(default=None, min_length=1)  # data URL
    mask_width: Optional[int] = Field(default=None, ge=1)
    mask_height: Optional[int] = Field(default=None, ge=1)
    version: int = 1


class MapConfig(ContractModel):
    """Map state for ETL boundary (session start/end)."""

    asset_id: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1)
    original_filename: Optional[str] = None
    file_path: str = Field(..., min_length=1)  # Presigned S3 URL
    file_size: Optional[int] = None  # Size in bytes
    grid_config: Optional[GridConfig] = None
    fog_config: Optional[FogConfig] = None
    map_image_config: Optional[Dict[str, Any]] = None  # Opaque to contracts, owned by frontend
