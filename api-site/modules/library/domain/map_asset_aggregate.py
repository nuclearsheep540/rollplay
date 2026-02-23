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
            session_ids=[],
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
        grid_opacity: Optional[float] = None
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
            session_ids=base.session_ids,
            created_at=base.created_at,
            updated_at=base.updated_at,
            grid_width=grid_width,
            grid_height=grid_height,
            grid_opacity=grid_opacity
        )

    def update_grid_config(
        self,
        grid_width: Optional[int] = None,
        grid_height: Optional[int] = None,
        grid_opacity: Optional[float] = None
    ) -> None:
        """
        Update grid configuration.

        Only updates provided values; None values keep current.
        """
        if grid_width is not None:
            if grid_width < 1 or grid_width > 100:
                raise ValueError("grid_width must be between 1 and 100")
            self.grid_width = grid_width

        if grid_height is not None:
            if grid_height < 1 or grid_height > 100:
                raise ValueError("grid_height must be between 1 and 100")
            self.grid_height = grid_height

        if grid_opacity is not None:
            if not 0.0 <= grid_opacity <= 1.0:
                raise ValueError("grid_opacity must be between 0.0 and 1.0")
            self.grid_opacity = grid_opacity

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

    def build_grid_config_for_game(self) -> dict | None:
        """Build the full grid_config shape expected by api-game/MongoDB.

        Translates domain fields into the runtime structure the frontend renders.
        Display defaults (line_color, line_width) are presentation constants owned
        by the frontend — they're reconstructed here to satisfy the boundary contract.
        Returns None if no grid has been configured.
        """
        if not self.has_grid_config():
            return None
        opacity = self.grid_opacity if self.grid_opacity is not None else 0.3
        return {
            "grid_width": self.grid_width,
            "grid_height": self.grid_height,
            "enabled": True,
            "colors": {
                "edit_mode": {"line_color": "#d1d5db", "opacity": opacity, "line_width": 1},
                "display_mode": {"line_color": "#d1d5db", "opacity": opacity, "line_width": 1},
            },
        }

    def update_grid_config_from_game(self, game_grid_config: dict) -> None:
        """Update domain fields from the api-game/MongoDB grid_config shape.

        The inverse of build_grid_config_for_game(). Extracts domain-owned fields
        (width, height, opacity) from the runtime structure. Opacity lives at
        colors.display_mode.opacity in the game shape, not as a top-level field.
        """
        if not game_grid_config:
            return
        grid_width = game_grid_config.get("grid_width")
        grid_height = game_grid_config.get("grid_height")
        # Opacity is nested in the colors structure in the game shape
        grid_opacity = (
            game_grid_config.get("colors", {}).get("display_mode", {}).get("opacity")
        )
        self.update_grid_config(
            grid_width=grid_width,
            grid_height=grid_height,
            grid_opacity=grid_opacity,
        )

    def clear_grid_config(self) -> None:
        """Clear grid configuration (reset to unconfigured state)."""
        self.grid_width = None
        self.grid_height = None
        self.grid_opacity = None
        self.updated_at = datetime.utcnow()
