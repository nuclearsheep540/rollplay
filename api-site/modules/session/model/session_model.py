# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session ORM Models - PostgreSQL persistence layer

Ubiquitous Language:
- Session = the campaign's table: who plays and when (this model)
- Game = one play, hot in api-game while it runs (modules/game)
"""

from sqlalchemy import Column, String, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
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
    Session entity - the campaign's table: who plays and when.

    Exactly one row per campaign, for the campaign's whole life, never replaced.
    It carries the party (session_joined_users) and the plan for the next game.

    It deliberately has NO status and NO play state. The boards, the adventure
    log and what was on screen belong to the game that produced them (see
    modules/game), and whether this session is live is answered by asking
    whether it has an open game.
    """
    __tablename__ = 'sessions'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=False)
    host_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # The plan for the next game: when it is, and what it is called. Cosmetic and
    # communicative only — nothing starts, reminds or polices on either. Start
    # takes the name onto the game; the host ending a game clears the date.
    scheduled_at = Column(DateTime(timezone=True), nullable=True)
    next_game_name = Column(String(100), nullable=True)

    # Relationships
    campaign = relationship("Campaign", back_populates="sessions")
    host = relationship("User", back_populates="sessions")

    # Joined users are accessed via session_joined_users table (not a simple relationship)
    # Use repository methods to fetch joined_users list

    def __repr__(self):
        return f"<Session(id={self.id}, campaign_id={self.campaign_id})>"
