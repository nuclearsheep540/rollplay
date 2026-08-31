# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session

from modules.news.repositories.news_repository import NewsRepository
from shared.dependencies.db import get_db


def news_repository(db: Session = Depends(get_db)) -> NewsRepository:
    """Inject a NewsRepository bound to the request's database session."""
    return NewsRepository(db)
