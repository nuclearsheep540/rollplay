# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Shared pytest fixtures for testing.

Provides database setup, repositories, and factory functions for creating test data.
"""

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PostgreSQL_UUID
import uuid
from datetime import datetime, timezone

from shared.dependencies.db import Base


# SQLite-compatible UUID type
class GUID(TypeDecorator):
    """Platform-independent GUID type.

    Uses PostgreSQL's UUID type, otherwise uses CHAR(36), storing as stringified hex values.
    """
    impl = CHAR
    cache_ok = True

    def load_dialect_impl(self, dialect):
        if dialect.name == 'postgresql':
            return dialect.type_descriptor(PostgreSQL_UUID())
        else:
            return dialect.type_descriptor(CHAR(36))

    def process_bind_param(self, value, dialect):
        if value is None:
            return value
        elif dialect.name == 'postgresql':
            return str(value)
        else:
            if not isinstance(value, uuid.UUID):
                return str(uuid.UUID(value))
            else:
                return str(value)

    def process_result_value(self, value, dialect):
        if value is None:
            return value
        else:
            if not isinstance(value, uuid.UUID):
                return uuid.UUID(value)
            else:
                return value
from modules.user.orm.user_repository import UserRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.characters.orm.character_repository import CharacterRepository
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.campaign.orm.campaign_repository import CampaignRepository

from modules.user.domain.user_aggregate import UserAggregate
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.characters.domain.character_aggregate import CharacterAggregate, CharacterClass, CharacterRace, AbilityScores
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate
from modules.campaign.domain.campaign_aggregate import CampaignAggregate


@pytest.fixture(scope="function")
def db_session():
    """
    Create an in-memory SQLite database for each test.

    Uses StaticPool to maintain connection across transactions.
    Automatically rolls back after each test for isolation.
    """
    # Monkey-patch UUID columns to use GUID for SQLite compatibility
    # Replace all UUID column types with GUID
    for table in Base.metadata.tables.values():
        for column in table.columns:
            if isinstance(column.type, PostgreSQL_UUID):
                column.type = GUID()

    # Register UUID adapters for SQLite
    import sqlite3
    sqlite3.register_adapter(uuid.UUID, lambda u: str(u))
    sqlite3.register_converter("UUID", lambda b: uuid.UUID(b.decode('utf-8')))

    # Create in-memory SQLite database
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    # Create all tables
    Base.metadata.create_all(engine)

    # Create session
    TestSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    session = TestSessionLocal()

    yield session

    # Cleanup
    session.close()
    Base.metadata.drop_all(engine)


@pytest.fixture
def user_repo(db_session: Session):
    """User repository with test database"""
    return UserRepository(db_session)


@pytest.fixture
def game_repo(db_session: Session):
    """Game repository with test database"""
    return SessionRepository(db_session)


@pytest.fixture
def character_repo(db_session: Session):
    """Character repository with test database"""
    return CharacterRepository(db_session)


@pytest.fixture
def friendship_repo(db_session: Session):
    """Friendship repository with test database"""
    return FriendshipRepository(db_session)


@pytest.fixture
def friend_request_repo(db_session: Session):
    """Friend request repository with test database"""
    from modules.friendship.repositories.friend_request_repository import FriendRequestRepository
    return FriendRequestRepository(db_session)


@pytest.fixture
def campaign_repo(db_session: Session):
    """Campaign repository with test database"""
    return CampaignRepository(db_session)


@pytest.fixture
def create_user(user_repo: UserRepository):
    """
    Factory fixture to create test users.

    Usage:
        user = create_user("test@example.com", "TestUser")
    """
    def _create_user(email: str = None, screen_name: str = None):
        if email is None:
            email = f"user{uuid.uuid4().hex[:8]}@example.com"

        user = UserAggregate.create(email=email)

        if screen_name:
            user.update_screen_name(screen_name)

        user_repo.save(user)
        return user

    return _create_user


@pytest.fixture
def create_campaign(campaign_repo: CampaignRepository):
    """
    Factory fixture to create test campaigns.

    Usage:
        campaign = create_campaign(host_id=user.id, title="Test Campaign")
    """
    def _create_campaign(host_id: uuid.UUID, title: str = "Test Campaign", description: str = "Test Description"):
        campaign = CampaignAggregate.create(
            title=title,
            description=description,
            host_id=host_id
        )
        campaign_repo.save(campaign)
        return campaign

    return _create_campaign


@pytest.fixture
def create_game(game_repo: SessionRepository):
    """
    Factory fixture to create test games.

    Usage:
        game = create_game(campaign_id=campaign.id, host_id=user.id, name="Test Game")
    """
    def _create_game(campaign_id: uuid.UUID, host_id: uuid.UUID, name: str = "Test Game", max_players: int = 6):
        game = SessionEntity.create(
            name=name,
            campaign_id=campaign_id,
            host_id=host_id,
            max_players=max_players
        )
        game_repo.save(game)
        return game

    return _create_game


@pytest.fixture
def create_character(character_repo: CharacterRepository):
    """
    Factory fixture to create test characters.

    Usage:
        character = create_character(user_id=user.id, name="Test Hero")
    """
    def _create_character(
        user_id: uuid.UUID,
        name: str = "Test Character",
        character_class: CharacterClass = CharacterClass.FIGHTER,
        character_race: CharacterRace = CharacterRace.HUMAN,
        level: int = 1
    ):
        abilities = AbilityScores(
            strength=10,
            dexterity=10,
            constitution=10,
            intelligence=10,
            wisdom=10,
            charisma=10
        )

        character = CharacterAggregate.create(
            active_campaign=None,  # New characters start unlocked
            user_id=user_id,
            character_name=name,
            character_class=character_class,
            character_race=character_race,
            level=level,
            ability_scores=abilities,
            hp_max=10,
            hp_current=10,
            ac=10
        )
        character_repo.save(character)
        return character

    return _create_character


@pytest.fixture
def create_friendship(friendship_repo: FriendshipRepository, friend_request_repo, user_repo):
    """
    Factory fixture to create test friendships.

    Uses the actual Send+Accept flow (not direct creation).

    Usage:
        friendship = create_friendship(user_a_id=user1.id, user_b_id=user2.id)
    """
    def _create_friendship(user_a_id: uuid.UUID, user_b_id: uuid.UUID):
        from modules.friendship.application.commands import SendFriendRequest, AcceptFriendRequest

        # User A sends request to User B
        send_cmd = SendFriendRequest(friendship_repo, friend_request_repo, user_repo)
        send_cmd.execute(user_id=user_a_id, friend_uuid=user_b_id)

        # User B accepts the request
        accept_cmd = AcceptFriendRequest(friendship_repo, friend_request_repo)
        friendship = accept_cmd.execute(user_id=user_b_id, requester_id=user_a_id)

        return friendship

    return _create_friendship
