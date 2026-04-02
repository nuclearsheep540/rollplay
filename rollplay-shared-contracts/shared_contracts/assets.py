# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Asset reference schema for cross-service asset identification."""

from typing import Optional

from .base import ContractModel


class AssetRef(ContractModel):
    """Reference to a library asset crossing the service boundary."""

    id: str
    filename: str
    s3_key: str
    asset_type: str  # "map", "music", "sfx", "image"
    s3_url: Optional[str] = None
    file_size: Optional[int] = None  # Size in bytes
