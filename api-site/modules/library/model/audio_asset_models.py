# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Audio Asset ORM Models - Joined table inheritance for audio-specific fields

Extends MediaAsset with audio playback configuration (duration, volume, looping).
Uses SQLAlchemy multi-level polymorphic inheritance:
  MediaAsset → AudioAssetModel (joined table) → MusicAssetModel / SfxAssetModel

MUSIC and SFX share the audio_assets table — same columns, different polymorphic identity.
ImageAssetModel remains single-table inheritance (no extra columns).
"""

from sqlalchemy import Column, Float, Boolean, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class AudioAssetModel(MediaAsset):
    """
    AudioAsset entity - extends MediaAsset with playback configuration.

    Joined table inheritance: audio_assets.id references media_assets.id
    Both MUSIC and SFX use this table — differentiated by polymorphic identity
    on the subclasses below.
    """
    __tablename__ = 'audio_assets'

    id = Column(
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True
    )

    # Audio playback configuration — NULL means not yet configured by user
    duration_seconds = Column(Float, nullable=True)
    default_volume = Column(Float, nullable=True)
    default_looping = Column(Boolean, nullable=True)

    # Intermediate class — subclasses provide the polymorphic_identity
    __mapper_args__ = {
        'polymorphic_abstract': True,
    }

    def __repr__(self):
        vol = f"vol={self.default_volume}" if self.default_volume is not None else "no vol"
        dur = f"{self.duration_seconds:.1f}s" if self.duration_seconds is not None else "no dur"
        return f"<AudioAsset(id={self.id}, filename='{self.filename}', {dur}, {vol})>"


class MusicAssetModel(AudioAssetModel):
    """Music (BGM) asset - inherits audio_assets table"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MUSIC,
    }


class SfxAssetModel(AudioAssetModel):
    """SFX asset - inherits audio_assets table"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.SFX,
    }


class ImageAssetModel(MediaAsset):
    """Image asset - single-table inheritance (no extra columns)"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.IMAGE,
    }
