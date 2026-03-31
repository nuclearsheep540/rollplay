# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Image boundary schema for the ETL between api-site and api-game."""

from typing import Optional

from .base import ContractModel


class ImageConfig(ContractModel):
    """Image state for ETL boundary."""

    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str  # Presigned S3 URL
    display_mode: str = "float"  # "float" | "wrap" | "cine"
    aspect_ratio: Optional[str] = None  # e.g. "2.39:1", "16:9" — only for cine
