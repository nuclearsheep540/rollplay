# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Map and grid boundary schemas for the ETL between api-site and api-game."""

from typing import Any, Dict, List, Literal, Optional

from pydantic import Field

from .base import ContractModel


# Fog regions soft-cap. The renderer composites one hide+texture pair
# per enabled region; cost scales linearly. 12 is roomy for typical use
# and bounded for performance.
FOG_REGIONS_MAX = 12


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


class FogRegion(ContractModel):
    """One independent fog area on a map.

    Each region owns its own painted alpha mask plus the render
    parameters that previously lived as file-level constants in
    FogCanvasLayer.js. Multiple enabled regions composite naturally
    via DOM stacking — overlapping enabled regions read as denser fog
    because two hide layers stack.

    Roles:
      • 'prepped' — pre-painted strategic area; toggled at runtime.
      • 'live'    — the always-present scratch region for ad-hoc paint
        during play. Exactly one 'live' region per map.

    The mask is a base64-encoded PNG data URL (with the
    `data:image/png;base64,` prefix). Alpha channel is meaningful:
    opaque pixels are fog, transparent pixels are revealed. Complex
    fog shapes (holes, disconnected regions, soft edges) are encoded
    entirely in the per-pixel alpha pattern — mask_width/mask_height
    are the bitmap bounds, not a geometric description.
    """

    id: str = Field(..., min_length=1)
    name: str = Field(default="Region", min_length=1, max_length=64)
    enabled: bool = Field(default=True)
    role: Literal["prepped", "live"] = Field(default="prepped")
    mask: Optional[str] = Field(default=None, min_length=1)  # data URL
    mask_width: Optional[int] = Field(default=None, ge=1)
    mask_height: Optional[int] = Field(default=None, ge=1)

    # Render params — were FOG_* constants in FogCanvasLayer.js.
    # FOG_HIDE_COLOR stays a file-level constant (consistent fog tone
    # across the map; not user-tunable). Only feather, dilate, and the
    # painter's knock-back opacity are region-editable.
    hide_feather_px: int = Field(default=20, ge=0, le=200)
    texture_dilate_px: int = Field(default=30, ge=0, le=200)
    paint_mode_opacity: float = Field(default=0.7, ge=0.0, le=1.0)


class FogConfig(ContractModel):
    """Fog of war state for a map — a list of independent regions.

    Each FogRegion owns its own mask + render params. The renderer
    composites enabled regions in DOM order; per-region mask shapes
    define what's hidden, and overlapping regions naturally read as
    denser fog.

    `regions` is capped at FOG_REGIONS_MAX entries. The list may be
    empty (no fog painted yet); a 'live' region is appended by the
    aggregate on first read so every active map has a scratch surface
    for ad-hoc paint during play.
    """

    regions: List[FogRegion] = Field(default_factory=list, max_length=FOG_REGIONS_MAX)
    version: int = 2


class MapConfig(ContractModel):
    """Map state for ETL boundary (session start/end) and the runtime
    map_load WebSocket event.

    `null` semantics for the optional fields (grid_config, fog_config,
    map_image_config) depend on the surface carrying this contract:

      • At ETL boundaries (cold→hot, hot→cold): null is meaningful and
        means "the user has no value for this field" — the value is
        applied as-is to runtime state or persisted as cleared.

      • At map_load (runtime "switch active map"): null means "no
        signal", and the receiver (api-game) preserves any existing
        in-room value for that field. See _merge_preserved_map_fields
        in api-game/websocket_handlers/websocket_events.py.

      • At field-specific events (fog_config_update, PATCH /fog) the
        field is its own contract; null there is the explicit clear
        signal.

    When adding a new optional MapConfig field, update:
      - MapAsset.to_contract / update_from_contract  (api-site domain)
      - _merge_preserved_map_fields                   (api-game WS)
    The contract's `extra="forbid"` config makes any spelling drift
    on the wire raise immediately rather than silently dropping.
    """

    asset_id: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1)
    original_filename: Optional[str] = None
    file_path: str = Field(..., min_length=1)  # Presigned S3 URL
    file_size: Optional[int] = None  # Size in bytes
    grid_config: Optional[GridConfig] = None
    fog_config: Optional[FogConfig] = None
    map_image_config: Optional[Dict[str, Any]] = None  # Opaque to contracts, owned by frontend
