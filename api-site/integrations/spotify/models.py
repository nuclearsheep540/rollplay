# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""SQLAlchemy model for the per-user Spotify account link.

One row per user who has connected Spotify. Holds the OAuth tokens needed to
call Spotify on their behalf. References the user by FK (ON DELETE CASCADE) so
a hard user delete cleans up automatically; soft-delete removes it explicitly
in UserRepository.soft_delete().
"""

from datetime import datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID

from shared.dependencies.db import Base


class SpotifyAccount(Base):
    __tablename__ = "spotify_accounts"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid4)
    user_id = Column(
        UUID(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        unique=True,
        nullable=False,
        index=True,
    )
    spotify_user_id = Column(String, nullable=False)
    display_name = Column(String, nullable=True)
    access_token = Column(String, nullable=False)
    refresh_token = Column(String, nullable=False)
    scope = Column(String, nullable=False, default="")
    expires_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    def is_expired(self, buffer_seconds: int = 60) -> bool:
        """True if the access token is expired (or expires within the buffer).

        Tolerates a naive expires_at (treated as UTC) in case a driver returns
        one, so the comparison never raises.
        """
        if self.expires_at is None:
            return True
        expires_at = self.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        return expires_at <= datetime.now(timezone.utc) + timedelta(seconds=buffer_seconds)

    def __repr__(self):
        return f"<SpotifyAccount user_id={self.user_id} spotify_user_id={self.spotify_user_id}>"
