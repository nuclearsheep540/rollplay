# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session ORM Models - PostgreSQL persistence layer

Ubiquitous Language:
- Session = The scheduled/planned play instance (this model)
- Game = The live multiplayer experience (handled by api-game/MongoDB)

Note: The 'active_game_id' field stores the MongoDB ObjectID when a game is running.
"""

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class SessionJoinedUser(Base):
    """Association table for users who have accepted invite and joined the session roster"""
    __tablename__ = 'session_joined_users'

    session_id = Column(UUID(as_uuid=True), ForeignKey('sessions.id', ondelete='CASCADE'), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    selected_character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='SET NULL'), nullable=True)

    # Relationships for easy access
    session = relationship("Session", backref=backref("roster_entries", passive_deletes=True))
    user = relationship("User", backref="joined_sessions")
    character = relationship("Character", backref="selected_for_sessions")

    def __repr__(self):
        return f"<SessionJoinedUser(session_id={self.session_id}, user_id={self.user_id}, character_id={self.selected_character_id})>"


class Session(Base):
    """
    Session entity - represents a scheduled play instance.

    When status is ACTIVE, an active game exists in MongoDB (api-game service).
    The active_game_id field stores the MongoDB document ID for the live game state.
    """
    __tablename__ = 'sessions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=True)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=False)
    host_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    status = Column(String(20), default='INACTIVE', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True))
    stopped_at = Column(DateTime(timezone=True))
    active_game_id = Column(String(100))  # MongoDB active_session objectID (when game is running)
    max_players = Column(Integer, default=8, nullable=False)  # Seat count in active game (1-8)
    audio_config = Column(JSONB, nullable=True, server_default='{}')  # Persisted audio channel config from ETL
    map_config = Column(JSONB, nullable=True, server_default='{}')  # Persisted active map config from ETL (just asset_id)
    image_config = Column(JSONB, nullable=True, server_default='{}')  # Persisted active image config from ETL
    active_display = Column(String(10), nullable=True)  # Which display was active: "map", "image", or null

    # Relationships
    campaign = relationship("Campaign", back_populates="sessions")
    host = relationship("User", back_populates="sessions")

    # Joined users are accessed via session_joined_users table (not a simple relationship)
    # Use repository methods to fetch joined_users list

    def __repr__(self):
        return f"<Session(id={self.id}, name='{self.name}', campaign_id={self.campaign_id}, status='{self.status}')>"
