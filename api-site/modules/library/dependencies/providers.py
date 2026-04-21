# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session as DbSession
from fastapi import Depends

from shared.dependencies.db import get_db
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.repositories.preset_repository import PresetRepository


def get_media_asset_repository(db: DbSession = Depends(get_db)) -> MediaAssetRepository:
    """Dependency injection for MediaAssetRepository"""
    return MediaAssetRepository(db)


def get_preset_repository(db: DbSession = Depends(get_db)) -> PresetRepository:
    """Dependency injection for PresetRepository"""
    return PresetRepository(db)


# Alias for backwards compatibility during migration
get_asset_repository = get_media_asset_repository
