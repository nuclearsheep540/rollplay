# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
SfxAsset ORM Model - Joined table inheritance for SFX-specific fields

Extends MediaAsset with audio playback configuration (duration, volume, looping).
Uses SQLAlchemy joined table inheritance pattern.
"""

from sqlalchemy import Column, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class SfxAssetModel(MediaAsset):
    """
    SfxAsset entity - extends MediaAsset with playback configuration.

    Joined table inheritance: sfx_assets.id references media_assets.id
    Audio config is stored here, not in the base table, because it only
    applies to SFX assets.
    """
    __tablename__ = 'sfx_assets'

    id = Column(
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True
    )

    # Audio playback configuration — NULL means not yet configured by user
    duration_seconds = Column(Float, nullable=True)
    default_volume = Column(Float, nullable=True)
    default_looping = Column(Boolean, nullable=True)

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.SFX,
    }

    def __repr__(self):
        vol = f"vol={self.default_volume}" if self.default_volume is not None else "no vol"
        dur = f"{self.duration_seconds:.1f}s" if self.duration_seconds is not None else "no dur"
        return f"<SfxAsset(id={self.id}, filename='{self.filename}', {dur}, {vol})>"
