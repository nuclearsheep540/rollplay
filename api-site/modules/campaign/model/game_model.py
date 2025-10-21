# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Table
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
import uuid

from shared.dependencies.db import Base


# Association table: Tracks pending invites (User → Game, before character selection)
game_invites = Table(
    'game_invites',
    Base.metadata,
    Column('game_id', UUID(as_uuid=True), ForeignKey('games.id', ondelete='CASCADE'), primary_key=True),
    Column('user_id', UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('invited_at', DateTime(timezone=True), server_default=func.now(), nullable=False),
    Column('invited_by', UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
)


# Association table: Tracks active players (Character → Game, after character selection)
game_characters = Table(
    'game_characters',
    Base.metadata,
    Column('game_id', UUID(as_uuid=True), ForeignKey('games.id', ondelete='CASCADE'), primary_key=True),
    Column('character_id', UUID(as_uuid=True), ForeignKey('characters.id', ondelete='CASCADE'), primary_key=True),
    Column('joined_at', DateTime(timezone=True), server_default=func.now(), nullable=False)
)


class Game(Base):
    __tablename__ = 'games'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(String(100), nullable=False)
    campaign_id = Column(UUID(as_uuid=True), ForeignKey('campaigns.id'), nullable=False)
    dungeon_master_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), nullable=False)
    status = Column(String(20), default='INACTIVE', nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    started_at = Column(DateTime(timezone=True))
    stopped_at = Column(DateTime(timezone=True))
    session_id = Column(String(100))  # MongoDB active_session objectID reference

    # Relationships
    campaign = relationship("Campaign", back_populates="games")
    dungeon_master = relationship("User", back_populates="games")

    # Many-to-many: Users with pending invites
    invited_users = relationship(
        "User",
        secondary=game_invites,
        primaryjoin="Game.id == game_invites.c.game_id",
        secondaryjoin="User.id == game_invites.c.user_id",
        backref="game_invites",
        lazy="joined"
    )

    # Many-to-many: Characters who have joined the game
    player_characters = relationship(
        "Character",
        secondary=game_characters,
        backref="games",
        lazy="joined"
    )

    def __repr__(self):
        return f"<Game(id={self.id}, name='{self.name}', campaign_id={self.campaign_id}, status='{self.status}')>"