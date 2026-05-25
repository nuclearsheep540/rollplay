# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MapAsset Aggregate - Domain model for map assets with grid configuration

Extends MediaAssetAggregate with grid configuration fields (width, height, opacity).
Grid configuration is stored on the asset itself, making it reusable across campaigns.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Any, Dict, List, Optional, Union
from uuid import UUID, uuid4

from shared_contracts.map import FOG_REGIONS_MAX, FogConfig, FogRegion, GridColorMode, GridConfig, MapConfig

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.media_asset_type import MediaAssetType


@dataclass
class MapAsset(MediaAssetAggregate):
    """
    MapAsset domain aggregate.

    Extends MediaAssetAggregate with grid configuration fields.
    Grid config belongs to the map asset, not the session - so it persists
    across all uses of this map in any campaign/session.
    """
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None
    grid_opacity: Optional[float] = None
    grid_offset_x: Optional[int] = None
    grid_offset_y: Optional[int] = None
    grid_line_color: Optional[str] = None
    grid_cell_size: Optional[float] = None
    # v2 shape: { "version": 2, "regions": [FogRegion, ...] } or None.
    # See FogConfig / FogRegion in shared_contracts.map for the field
    # schema. None means "no fog ever painted on this map".
    fog_config: Optional[Dict[str, Any]] = None

    @classmethod
    def create(
        cls,
        user_id: UUID,
        filename: str,
        s3_key: str,
        content_type: str,
        file_size: Optional[int] = None,
        campaign_id: Optional[UUID] = None,
        grid_width: Optional[int] = None,
        grid_height: Optional[int] = None,
        grid_opacity: Optional[float] = None
    ) -> "MapAsset":
        """
        Factory method to create a new map asset.

        Forces asset_type to MAP regardless of any passed value.
        """
        # Validate content type for maps
        valid_map_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
        if content_type not in valid_map_types:
            raise ValueError(f"Invalid content_type for map: {content_type}")

        campaign_ids = [campaign_id] if campaign_id else []

        return cls(
            id=uuid4(),
            user_id=user_id,
            filename=filename,
            s3_key=s3_key,
            content_type=content_type,
            asset_type=MediaAssetType.MAP,  # Always MAP
            file_size=file_size,
            campaign_ids=campaign_ids,
            created_at=datetime.utcnow(),
            updated_at=None,
            grid_width=grid_width,
            grid_height=grid_height,
            grid_opacity=grid_opacity
        )

    @classmethod
    def from_base(
        cls,
        base: MediaAssetAggregate,
        grid_width: Optional[int] = None,
        grid_height: Optional[int] = None,
        grid_opacity: Optional[float] = None,
        grid_offset_x: Optional[int] = None,
        grid_offset_y: Optional[int] = None,
        grid_line_color: Optional[str] = None,
        grid_cell_size: Optional[float] = None,
        fog_config: Optional[Dict[str, Any]] = None,
    ) -> "MapAsset":
        """
        Promote a base MediaAssetAggregate to MapAsset.

        Used when repository loads from joined tables.
        """
        return cls(
            id=base.id,
            user_id=base.user_id,
            filename=base.filename,
            s3_key=base.s3_key,
            content_type=base.content_type,
            asset_type=base.asset_type,
            file_size=base.file_size,
            campaign_ids=base.campaign_ids,
            created_at=base.created_at,
            updated_at=base.updated_at,
            grid_width=grid_width,
            grid_height=grid_height,
            grid_opacity=grid_opacity,
            grid_offset_x=grid_offset_x,
            grid_offset_y=grid_offset_y,
            grid_line_color=grid_line_color,
            grid_cell_size=grid_cell_size,
            fog_config=fog_config,
        )

    def update_grid_config(
        self,
        grid_width: Optional[int] = None,
        grid_height: Optional[int] = None,
        grid_opacity: Optional[float] = None,
        grid_offset_x: Optional[int] = None,
        grid_offset_y: Optional[int] = None,
        grid_line_color: Optional[str] = None,
        grid_cell_size: Optional[float] = None
    ) -> None:
        """
        Update grid configuration.

        Only updates provided values; None values keep current.
        """
        if grid_width is not None:
            if grid_width < 1 or grid_width > 1000:
                raise ValueError("grid_width must be between 1 and 1000")
            self.grid_width = grid_width

        if grid_height is not None:
            if grid_height < 1 or grid_height > 1000:
                raise ValueError("grid_height must be between 1 and 1000")
            self.grid_height = grid_height

        if grid_opacity is not None:
            if not 0.0 <= grid_opacity <= 1.0:
                raise ValueError("grid_opacity must be between 0.0 and 1.0")
            self.grid_opacity = grid_opacity

        if grid_offset_x is not None:
            self.grid_offset_x = grid_offset_x

        if grid_offset_y is not None:
            self.grid_offset_y = grid_offset_y

        if grid_line_color is not None:
            self.grid_line_color = grid_line_color

        if grid_cell_size is not None:
            self.grid_cell_size = grid_cell_size

        self.updated_at = datetime.utcnow()

    def has_grid_config(self) -> bool:
        """Check if grid configuration has been set."""
        return self.grid_width is not None and self.grid_height is not None

    def get_grid_config(self) -> dict:
        """Return grid config as a dict for API responses and ETL."""
        return {
            "grid_width": self.grid_width,
            "grid_height": self.grid_height,
            "grid_opacity": self.grid_opacity
        }

    def build_grid_config_for_game(self) -> GridConfig | None:
        """Build the grid config contract for the api-game boundary.

        Contract defaults (line_color="#d1d5db", opacity=0.5, line_width=1)
        apply when domain fields are None. Returns None if no grid configured.
        """
        if not self.has_grid_config():
            return None
        color_kwargs = {}
        if self.grid_opacity is not None:
            color_kwargs["opacity"] = self.grid_opacity
        if self.grid_line_color is not None:
            color_kwargs["line_color"] = self.grid_line_color
        color_mode = GridColorMode(**color_kwargs)
        grid_kwargs = {}
        if self.grid_offset_x is not None:
            grid_kwargs["offset_x"] = self.grid_offset_x
        if self.grid_offset_y is not None:
            grid_kwargs["offset_y"] = self.grid_offset_y
        if self.grid_cell_size is not None:
            grid_kwargs["grid_cell_size"] = self.grid_cell_size
        return GridConfig(
            grid_width=self.grid_width,
            grid_height=self.grid_height,
            colors={"edit_mode": color_mode, "display_mode": color_mode},
            **grid_kwargs,
        )

    def update_grid_config_from_game(self, game_grid_config: GridConfig) -> None:
        """Update domain fields from the api-game grid config contract.

        The inverse of build_grid_config_for_game(). Extracts domain-owned fields
        (width, height, opacity, offset, line_color) from the contract type.
        """
        if not game_grid_config:
            return
        grid_opacity = None
        grid_line_color = None
        if game_grid_config.colors and "display_mode" in game_grid_config.colors:
            grid_opacity = game_grid_config.colors["display_mode"].opacity
            grid_line_color = game_grid_config.colors["display_mode"].line_color
        self.update_grid_config(
            grid_width=game_grid_config.grid_width,
            grid_height=game_grid_config.grid_height,
            grid_opacity=grid_opacity,
            grid_offset_x=game_grid_config.offset_x,
            grid_offset_y=game_grid_config.offset_y,
            grid_line_color=grid_line_color,
            grid_cell_size=game_grid_config.grid_cell_size,
        )

    def clear_grid_config(self) -> None:
        """Clear grid configuration (reset to unconfigured state)."""
        self.grid_width = None
        self.grid_height = None
        self.grid_opacity = None
        self.updated_at = datetime.utcnow()

    # ── Fog of war ──────────────────────────────────────────────────────
    #
    # Fog is a list of independent regions. Each region owns its own
    # alpha mask + render params (feather, dilate, etc.). At runtime,
    # enabled regions composite by DOM stacking — overlapping regions
    # read as denser fog. Cap of FOG_REGIONS_MAX (12) per the contract.
    #
    # Region helpers below (add/update/delete/toggle) are the granular
    # path used by per-region endpoints (step 5+). update_fog_config()
    # is the atomic full-list replace path used by the existing PATCH
    # /fog endpoint.

    def update_fog_config(
        self,
        regions: Optional[List[Dict[str, Any]]] = None,
    ) -> None:
        """Atomic full replace of the regions list.

        Pass regions=None or [] to clear all fog. Each region dict is
        validated against the FogRegion contract before storage —
        unknown fields raise, missing required fields raise.
        """
        if regions is None or len(regions) == 0:
            self.fog_config = None
        else:
            if len(regions) > FOG_REGIONS_MAX:
                raise ValueError(
                    f"Cannot have more than {FOG_REGIONS_MAX} fog regions"
                )
            validated = [FogRegion.model_validate(r).model_dump() for r in regions]
            self.fog_config = {"version": 2, "regions": validated}
        self.updated_at = datetime.utcnow()

    def has_fog_config(self) -> bool:
        """True if any region has a populated mask. Empty regions
        (just metadata, no painted alpha) don't count."""
        if not self.fog_config:
            return False
        regions = self.fog_config.get("regions", [])
        return any(r.get("mask") for r in regions)

    def get_fog_config(self) -> Optional[Dict[str, Any]]:
        """Return the v2 fog config dict (or None if no fog ever set)."""
        return self.fog_config

    def get_fog_regions(self) -> List[Dict[str, Any]]:
        """Return the regions list, empty when no fog configured."""
        if not self.fog_config:
            return []
        return list(self.fog_config.get("regions", []))

    def add_fog_region(
        self,
        name: str = "Region",
        role: str = "prepped",
    ) -> Dict[str, Any]:
        """Append a new region with default render params; return it."""
        regions = self.get_fog_regions()
        if len(regions) >= FOG_REGIONS_MAX:
            raise ValueError(
                f"Cannot have more than {FOG_REGIONS_MAX} fog regions"
            )
        new_region = FogRegion(
            id=uuid4().hex, name=name, role=role,  # type: ignore[arg-type]
        ).model_dump()
        regions.append(new_region)
        self.fog_config = {"version": 2, "regions": regions}
        self.updated_at = datetime.utcnow()
        return new_region

    def update_fog_region(self, region_id: str, **fields: Any) -> Dict[str, Any]:
        """Partial update of one region. Keys must match FogRegion
        fields. Returns the updated region dict.
        """
        regions = self.get_fog_regions()
        for i, r in enumerate(regions):
            if r.get("id") == region_id:
                merged = {**r, **fields}
                regions[i] = FogRegion.model_validate(merged).model_dump()
                self.fog_config = {"version": 2, "regions": regions}
                self.updated_at = datetime.utcnow()
                return regions[i]
        raise ValueError(f"Region {region_id} not found")

    def delete_fog_region(self, region_id: str) -> None:
        """Remove a region. Raises if region's role is 'live' (the
        live region is structural — every map keeps one for ad-hoc
        paint at runtime).
        """
        regions = self.get_fog_regions()
        for i, r in enumerate(regions):
            if r.get("id") == region_id:
                if r.get("role") == "live":
                    raise ValueError("Cannot delete the live region")
                del regions[i]
                self.updated_at = datetime.utcnow()
                self.fog_config = (
                    {"version": 2, "regions": regions} if regions else None
                )
                return
        raise ValueError(f"Region {region_id} not found")

    def toggle_fog_region(self, region_id: str, enabled: bool) -> Dict[str, Any]:
        """Set the enabled flag on a region; returns updated region."""
        return self.update_fog_region(region_id, enabled=enabled)

    def build_fog_config_for_game(self) -> Optional[FogConfig]:
        """Build the v2 FogConfig contract for the api-game ETL boundary.

        Returns None if no fog has been touched, so the contract layer
        can omit `fog_config` entirely on session start.
        """
        if not self.fog_config:
            return None
        return FogConfig.model_validate(self.fog_config)

    def update_fog_config_from_game(
        self, game_fog_config: Optional[FogConfig]
    ) -> None:
        """Inverse of build_fog_config_for_game(). Persists the final
        runtime fog state back onto the asset on session end. None
        means the runtime cleared the fog — propagate that to PSQL.
        """
        if game_fog_config is None:
            self.update_fog_config(regions=None)
            return
        self.update_fog_config(
            regions=[r.model_dump() for r in game_fog_config.regions]
        )

    # ── Contract projection (the single source of truth for ETL) ────────

    def to_contract(self, file_path: str) -> MapConfig:
        """Project this aggregate to the MapConfig contract for the
        api-game boundary. Single source of truth for which aggregate
        fields populate which contract fields — adding a new MapConfig
        field updates this method and every consumer (cold→hot ETL,
        future ETL-like callers) benefits automatically.

        Pydantic's `extra='forbid'` makes shape drift fail loudly here
        rather than silently dropping a field downstream.
        """
        return MapConfig.model_validate({
            "asset_id":          str(self.id),
            "filename":          self.filename,
            "original_filename": self.filename,
            "file_path":         file_path,
            "file_size":         self.file_size,
            "grid_config":       self.build_grid_config_for_game(),
            "fog_config":        self.build_fog_config_for_game(),
        })

    def update_from_contract(self, contract: MapConfig) -> None:
        """Apply a MapConfig (final session state) back onto this aggregate.
        Inverse of to_contract(). Same single-source-of-truth role for
        the hot→cold direction at session end.

        Note: this is the *owner* path for fog — null means "the runtime
        cleared the fog, persist that". Surfaces that merely chaperone
        a MapConfig (e.g. WS map_load) need to apply the preserve rule
        themselves before calling this.
        """
        if contract is None:
            return
        if contract.grid_config is not None:
            self.update_grid_config_from_game(contract.grid_config)
        # Fog: pass through as-is. None propagates as a clear, matching
        # update_fog_config_from_game's owner semantics.
        self.update_fog_config_from_game(contract.fog_config)
