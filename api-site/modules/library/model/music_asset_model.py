# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MusicAsset ORM Model - Joined table inheritance for music-specific fields

Extends MediaAsset with audio playback configuration (duration, volume, looping).
Uses SQLAlchemy joined table inheritance pattern.
"""

from sqlalchemy import Column, Float, Boolean, String, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class MusicAssetModel(MediaAsset):
    """
    MusicAsset entity - extends MediaAsset with playback configuration.

    Joined table inheritance: music_assets.id references media_assets.id.
    The PK/FK column is mapped to `_subtype_pk` so it doesn't shadow the
    inherited `.id` from the base mapper — see MapAssetModel for rationale.
    """
    __tablename__ = 'music_assets'

    _subtype_pk = Column(
        'id',
        UUID(as_uuid=True),
        ForeignKey('media_assets.id', ondelete='CASCADE'),
        primary_key=True,
    )

    # Audio playback configuration — NULL means not yet configured by user
    duration_seconds = Column(Float, nullable=True)
    default_volume = Column(Float, nullable=True)
    default_looping = Column(Boolean, nullable=True)

    # Audio effects — asset-level defaults
    effect_eq_enabled = Column(Boolean, nullable=True)
    effect_hpf_enabled = Column(Boolean, nullable=True)
    effect_hpf_mix = Column(Float, nullable=True)
    effect_lpf_enabled = Column(Boolean, nullable=True)
    effect_lpf_mix = Column(Float, nullable=True)
    effect_reverb_enabled = Column(Boolean, nullable=True)
    effect_reverb_mix = Column(Float, nullable=True)
    effect_reverb_preset = Column(String, nullable=True)

    # Loop point / BPM configuration — asset-level defaults for DAW
    loop_start = Column(Float, nullable=True)       # seconds
    loop_end = Column(Float, nullable=True)          # seconds
    bpm = Column(Float, nullable=True)               # beats per minute
    loop_mode = Column(String, nullable=True)        # "off" | "full" | "continuous" | "region"
    time_signature = Column(String(8), nullable=True)  # "4/4" etc. — beat grid rendering

    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MUSIC,
    }

    def __repr__(self):
        vol = f"vol={self.default_volume}" if self.default_volume is not None else "no vol"
        dur = f"{self.duration_seconds:.1f}s" if self.duration_seconds is not None else "no dur"
        return f"<MusicAsset(id={self.id}, filename='{self.filename}', {dur}, {vol})>"
