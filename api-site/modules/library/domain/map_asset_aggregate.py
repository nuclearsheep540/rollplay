# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MapAsset Aggregate - Domain model for map assets with grid configuration

Extends MediaAssetAggregate with grid configuration fields (width, height, opacity).
Grid configuration is stored on the asset itself, making it reusable across campaigns.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Union
from uuid import UUID, uuid4

from shared_contracts.map import GridColorMode, GridConfig

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
        grid_cell_size: Optional[float] = None
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
            grid_cell_size=grid_cell_size
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
