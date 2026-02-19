# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Image Asset ORM Model - Single-table inheritance for IMAGE assets

No extra columns — IMAGE assets use only the base media_assets table fields.
Exists as a separate model for pattern consistency with MapAssetModel and
MusicAssetModel and SfxAssetModel, so every asset type has a discoverable model file.
"""

from modules.library.model.asset_model import MediaAsset
from modules.library.domain.media_asset_type import MediaAssetType


class ImageAssetModel(MediaAsset):
    """Image asset - single-table inheritance (no extra columns)"""
    __mapper_args__ = {
        'polymorphic_identity': MediaAssetType.IMAGE,
    }
