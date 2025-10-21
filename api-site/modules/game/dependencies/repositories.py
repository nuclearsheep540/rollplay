# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from fastapi import Depends

from shared.dependencies.db import get_db
from modules.game.repositories.game_repository import GameRepository


def get_game_repository(db: Session = Depends(get_db)) -> GameRepository:
    """Dependency injection for GameRepository"""
    return GameRepository(db)
