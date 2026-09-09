# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session as DbSession

from modules.game.repositories.game_repository import GameRepository
from shared.dependencies.db import get_db


def get_game_repository(db: DbSession = Depends(get_db)) -> GameRepository:
    """Dependency injection for GameRepository"""
    return GameRepository(db)
