# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MapAsset ORM Model - Joined table inheritance for map-specific fields

Extends MediaAsset with grid configuration fields (width, height, opacity).
Uses SQLAlchemy joined table inheritance pattern.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey, String
from sqlalchemy.dialects.postgresql import JSONB, UUID

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class MapAssetModel(MediaAsset):
    """
    MapAsset entity - extends MediaAsset with grid configuration.

    Joined table inheritance: map_assets.id references media_assets.id.
    The PK/FK column is mapped to the Python attribute `_subtype_pk` so
    it doesn't shadow the inherited `.id` from the base mapper. That way
    `instance.id` always resolves to `media_assets.id` (guaranteed real),
    regardless of whether the LEFT JOIN to map_assets returned a row.
    Without this aliasing, a type-changed asset with no `map_assets` row
    would surface as `.id == None` and break callers downstream.
    """
    __tablename__ = 'map_assets'

    _subtype_pk = Column(
        'id',
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True,
    )

    # Grid configuration - NULL means not yet configured by user
    grid_width = Column(Integer, nullable=True)
    grid_height = Column(Integer, nullable=True)
    grid_opacity = Column(Float, nullable=True)
    grid_offset_x = Column(Integer, nullable=True)
    grid_offset_y = Column(Integer, nullable=True)
    grid_line_color = Column(String(20), nullable=True)  # hex colour e.g. "#d1d5db"
    grid_cell_size = Column(Float, nullable=True)  # absolute cell size in native image pixels

    # Fog of war mask - NULL means no fog painted yet
    # Shape: { mask: data-url string, mask_width: int, mask_height: int, version: int }
    # See shared_contracts.map.FogConfig for the canonical contract.
    fog_config = Column(JSONB, nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MAP,  # Enum value, not string
    }

    def __repr__(self):
        grid = f"{self.grid_width}x{self.grid_height}" if self.grid_width else "no grid"
        return f"<MapAsset(id={self.id}, filename='{self.filename}', {grid})>"
