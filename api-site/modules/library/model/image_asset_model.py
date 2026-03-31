# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Image Asset ORM Model - Joined table inheritance for image display config

Extends MediaAsset with display configuration fields (display_mode, aspect_ratio).
Uses SQLAlchemy joined table inheritance pattern, matching MapAssetModel.
"""

from sqlalchemy import Column, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

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

    # Display configuration - NULL means not yet configured (defaults to "float")
    display_mode = Column(String(20), nullable=True)   # "float" | "wrap" | "letterbox"
    aspect_ratio = Column(String(20), nullable=True)   # "2.39:1", "1.85:1", "16:9", "4:3", "1:1"

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.IMAGE,
    }

    def __repr__(self):
        mode = self.display_mode or "float"
        return f"<ImageAsset(id={self.id}, filename='{self.filename}', mode={mode})>"
