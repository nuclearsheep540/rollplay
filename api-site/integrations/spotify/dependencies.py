# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""FastAPI dependency providers for the Spotify integration."""

from fastapi import Depends
from sqlalchemy.orm import Session

from shared.dependencies.db import get_db
from integrations.spotify.repository import SpotifyAccountRepository


def spotify_account_repository(db: Session = Depends(get_db)) -> SpotifyAccountRepository:
    return SpotifyAccountRepository(db)
