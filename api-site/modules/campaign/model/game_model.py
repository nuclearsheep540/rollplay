# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship, backref
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


class GameJoinedUser(Base):
    """Association table for users who have accepted invite and joined the roster"""
    __tablename__ = 'game_joined_users'

    game_id = Column(UUID(as_uuid=True), ForeignKey('games.id', ondelete='CASCADE'), primary_key=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True)
    joined_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    selected_character_id = Column(UUID(as_uuid=True), ForeignKey('characters.id', ondelete='SET NULL'), nullable=True)

    # Relationships for easy access
    game = relationship("Game", backref=backref("roster_entries", passive_deletes=True))
    user = relationship("User", backref="joined_games")
    character = relationship("Character", backref="selected_for_games")

    def __repr__(self):
        return f"<GameJoinedUser(game_id={self.game_id}, user_id={self.user_id}, character_id={self.selected_character_id})>"


class Game(Base):
    __tablename__ = 'games'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=False)
    host_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)  # RENAMED from dungeon_master_id
    status = Column(String(20), default='INACTIVE', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True))
    stopped_at = Column(DateTime(timezone=True))
    session_id = Column(String(100))  # MongoDB active_session objectID reference
    max_players = Column(Integer, default=8, nullable=False)  # Seat count (1-8)

    # Relationships
    campaign = relationship("Campaign", back_populates="games")
    host = relationship("User", back_populates="games")  # RENAMED from dungeon_master

    # Joined users are accessed via game_joined_users table (not a simple relationship)
    # Use repository methods to fetch joined_users list

    def __repr__(self):
        return f"<Game(id={self.id}, name='{self.name}', campaign_id={self.campaign_id}, status='{self.status}')>"