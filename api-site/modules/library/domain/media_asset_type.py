# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAssetType Enum - Defines valid types for S3-backed media assets

This enum is used at multiple levels:
- Domain layer: Type hints and validation
- API layer: Pydantic schema validation
- Database layer: PostgreSQL enum type
"""

from enum import Enum


class MediaAssetType(str, Enum):
    """
    Types of media assets that can be stored in S3.

    Inherits from str for JSON serialization compatibility.
    Maps to PostgreSQL enum type 'media_asset_type'.
    """
    MAP = "map"
    MUSIC = "music"
    SFX = "sfx"
    IMAGE = "image"
