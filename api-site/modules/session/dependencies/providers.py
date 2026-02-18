# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session as DbSession
from fastapi import Depends

from shared.dependencies.db import get_db
from modules.session.repositories.session_repository import SessionRepository


def get_session_repository(db: DbSession = Depends(get_db)) -> SessionRepository:
    """Dependency injection for SessionRepository"""
    return SessionRepository(db)
