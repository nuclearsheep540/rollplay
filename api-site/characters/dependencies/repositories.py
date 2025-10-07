# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from shared.db import get_db
from characters.repositories.character_repository import CharacterRepository


def get_character_repository(db: Session = Depends(get_db)) -> CharacterRepository:
    return CharacterRepository(db)
