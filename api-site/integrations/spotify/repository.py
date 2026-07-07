# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Data access for the spotify_accounts table.

Kept deliberately simple (returns the ORM model directly) — this is integration
plumbing, not a domain aggregate, so it doesn't warrant the full aggregate/mapper
ceremony the core `modules/` use.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from uuid import UUID

from sqlalchemy.orm import Session

from integrations.spotify.models import SpotifyAccount


class SpotifyAccountRepository:
    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_user_id(self, user_id: UUID) -> Optional[SpotifyAccount]:
        return self.db.query(SpotifyAccount).filter_by(user_id=user_id).first()

    def upsert(
        self,
        user_id: UUID,
        spotify_user_id: str,
        display_name: Optional[str],
        access_token: str,
        refresh_token: str,
        scope: str,
        expires_at: datetime,
    ) -> SpotifyAccount:
        """Create or update the user's Spotify link after a successful connect."""
        account = self.get_by_user_id(user_id)
        if account is None:
            account = SpotifyAccount(user_id=user_id)
            self.db.add(account)

        account.spotify_user_id = spotify_user_id
        account.display_name = display_name
        account.access_token = access_token
        account.refresh_token = refresh_token
        account.scope = scope
        account.expires_at = expires_at

        self.db.commit()
        self.db.refresh(account)
        return account

    def update_tokens(
        self,
        account: SpotifyAccount,
        access_token: str,
        refresh_token: str,
        expires_in: int,
        scope: Optional[str] = None,
    ) -> SpotifyAccount:
        """Persist a refreshed access token (and possibly a new refresh token)."""
        account.access_token = access_token
        account.refresh_token = refresh_token
        account.expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        if scope:
            account.scope = scope
        self.db.commit()
        self.db.refresh(account)
        return account

    def delete(self, user_id: UUID) -> bool:
        account = self.get_by_user_id(user_id)
        if account is None:
            return False
        self.db.delete(account)
        self.db.commit()
        return True
