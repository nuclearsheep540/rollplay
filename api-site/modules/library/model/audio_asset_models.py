# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Single-Table Inheritance Models for Non-Map Asset Types

These models exist to register polymorphic identities with SQLAlchemy.
Without them, loading MUSIC/SFX/IMAGE assets throws:
  "No such polymorphic_identity <MediaAssetType.SFX: 'sfx'> is defined"

Key points:
- No __tablename__ = No extra database tables (single-table inheritance)
- No extra columns - just identity registration
- MapAssetModel uses joined-table inheritance (has extra grid columns)
"""

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class MusicAssetModel(MediaAsset):
    """Music asset - single-table inheritance (no extra columns)"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.MUSIC,
    }


class SfxAssetModel(MediaAsset):
    """SFX asset - single-table inheritance (no extra columns)"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.SFX,
    }


class ImageAssetModel(MediaAsset):
    """Image asset - single-table inheritance (no extra columns)"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.IMAGE,
    }
