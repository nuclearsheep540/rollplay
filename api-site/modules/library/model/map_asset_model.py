# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MapAsset ORM Model - Joined table inheritance for map-specific fields

Extends MediaAsset with grid configuration fields (width, height, opacity).
Uses SQLAlchemy joined table inheritance pattern.
"""

from sqlalchemy import Column, Integer, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class MapAssetModel(MediaAsset):
    """
    MapAsset entity - extends MediaAsset with grid configuration.

    Joined table inheritance: map_assets.id references media_assets.id
    Grid config is stored here, not in the base table, because it only
    applies to map assets.
    """
    __tablename__ = 'map_assets'

    id = Column(
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True
    )

    # Grid configuration - NULL means not yet configured by user
    grid_width = Column(Integer, nullable=True)
    grid_height = Column(Integer, nullable=True)
    grid_opacity = Column(Float, nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MAP,  # Enum value, not string
    }

    def __repr__(self):
        grid = f"{self.grid_width}x{self.grid_height}" if self.grid_width else "no grid"
        return f"<MapAsset(id={self.id}, filename='{self.filename}', {grid})>"
