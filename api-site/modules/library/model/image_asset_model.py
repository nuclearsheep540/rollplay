# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Image Asset ORM Model - Joined table inheritance for image display config

Extends MediaAsset with display configuration fields (display_mode, aspect_ratio).
Uses SQLAlchemy joined table inheritance pattern, matching MapAssetModel.
"""

from sqlalchemy import Column, String, Float, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class ImageAssetModel(MediaAsset):
    """
    ImageAsset entity - extends MediaAsset with display configuration.

    Joined table inheritance: image_assets.id references media_assets.id
    Display config is stored here, not in the base table, because it only
    applies to image assets.
    """
    __tablename__ = 'image_assets'

    id = Column(
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True
    )

    # Image fit — how the image fills the frame
    image_fit = Column(String(20), nullable=True)      # "float" | "wrap" | "letterbox"
    aspect_ratio = Column(String(20), nullable=True)   # "2.39:1", "1.85:1", "16:9", "4:3", "1:1"

    # Display mode — game UI behaviour when image is shown
    display_mode = Column(String(20), nullable=True, default="standard")  # "standard" | "cine"

    # Image position within frame (object-position percentages)
    image_position_x = Column(Float, nullable=True)  # 0–100%
    image_position_y = Column(Float, nullable=True)  # 0–100%

    # Visual effects — independent of display mode
    visual_overlays = Column(JSONB, nullable=True)
    motion = Column(JSONB, nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.IMAGE,
    }

    def __repr__(self):
        fit = self.image_fit or "float"
        return f"<ImageAsset(id={self.id}, filename='{self.filename}', fit={fit})>"
