# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Game ORM Model - PostgreSQL persistence layer

A game is ONE play, from Start to End. Its id IS the api-game room id, so while
the game is open a MongoDB document exists under that id and the browser's
`/game?room_id=` carries it. When the game ends the room is deleted and this row
becomes the record of the night: who was there, what happened, and where
everything was left.

That last part is why the play state lives here rather than on the session: a
session cannot produce a token board or an adventure log, only a running game
can. The next game seeds from the newest ended one.
"""

from sqlalchemy import Column, String, DateTime, ForeignKey, Index, Text, text
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class Game(Base):
    """One play of a campaign, hot while open and history once ended."""

    __tablename__ = 'games'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    session_id = Column(UUID(as_uuid=True), ForeignKey('sessions.id', ondelete='CASCADE'), nullable=False)
    # Denormalised from the session so "is this campaign live" and "games played
    # on this campaign" need no join. Never written independently of session_id.
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id', ondelete='CASCADE'), nullable=False)
    host_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    status = Column(String(20), nullable=False)  # starting | active | ending | ended
    name = Column(String(100), nullable=True)  # The GM's name for the night; planned before Start or given at End
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True))  # Stamped when api-game confirms the room
    ended_at = Column(DateTime(timezone=True))
    ended_by = Column(String(20), nullable=True)  # host | system; null while open and on migrated rows
    urls_expire_at = Column(DateTime(timezone=True))  # Signed asset-URL lease deadline; the sweeper ends past-due games
    summary = Column(Text, nullable=True)  # "What happened" — GM-written at End, editable afterwards
    # [{"user_id": "<uuid>", "character_id": "<uuid>|null"}] — who was at the table,
    # written once at End from api-game's final state. Never edited.
    attendance = Column(JSONB, nullable=False, server_default='[]')

    # --- The state of play, written by this game and read by the next one ---
    map_token_seed = Column(JSONB, nullable=True, server_default='{}')  # Board as this game opened it — the next merge's diff base
    map_token_state = Column(JSONB, nullable=True, server_default='{}')  # Token boards as this game left them (asset_id -> list[MapToken])
    adventure_log = Column(JSONB, nullable=True, server_default='[]')  # LogEntry-shaped dicts, capped at 200
    map_config = Column(JSONB, nullable=True, server_default='{}')  # Active map at End (just asset_id)
    image_config = Column(JSONB, nullable=True, server_default='{}')  # Active image at End
    active_display = Column(String(10), nullable=True)  # "map", "image", or null
    audio_config = Column(JSONB, nullable=True, server_default='{}')  # Audio channel config at End
    spotify_config = Column(JSONB, nullable=True, server_default='{}')  # DM Spotify BGM block at End

    session = relationship("Session", backref=backref("games", passive_deletes=True))

    __table_args__ = (
        # The invariant, enforced by the database rather than by application
        # code: a session may have many games but only one open at a time. The
        # partial clause is what lets ended rows accumulate freely under the
        # same key — declared for BOTH dialects deliberately, so the SQLite test
        # harness enforces the same rule PostgreSQL does. Without sqlite_where
        # the harness would silently apply a total unique index and refuse a
        # session its second game, which is the opposite of the invariant.
        Index(
            'ix_games_one_open_per_session', 'session_id', unique=True,
            postgresql_where=text("status <> 'ended'"),
            sqlite_where=text("status <> 'ended'"),
        ),
        Index('ix_games_session_ended', 'session_id', 'ended_at'),  # "newest ended game" lookup
        Index('ix_games_campaign_id', 'campaign_id'),  # "is this campaign live"
    )

    def __repr__(self):
        return f"<Game(id={self.id}, session_id={self.session_id}, status='{self.status}')>"
