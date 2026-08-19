# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session as DbSession

from modules.notes.repositories.note_repository import NoteRepository
from shared.dependencies.db import get_db


def get_note_repository(db: DbSession = Depends(get_db)) -> NoteRepository:
    """Dependency injection for NoteRepository"""
    return NoteRepository(db)
