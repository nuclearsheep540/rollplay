# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Shared pytest fixtures for testing.

Provides database setup, repositories, and factory functions for creating test data.
"""

import os

# Set dummy env vars before any imports that trigger pydantic-settings Settings()
_test_env = {
    "POSTGRES_USER": "test",
    "POSTGRES_PASSWORD": "test",
    "POSTGRES_HOST": "localhost",
    "POSTGRES_PORT": "5432",
    "POSTGRES_DB": "test",
    "APP_DB_USER": "test",
    "APP_DB_PASSWORD": "test",
    "JWT_SECRET_KEY": "test-secret",
    "AWS_ACCESS_KEY_ID": "test",
    "AWS_SECRET_ACCESS_KEY": "test",
    "S3_BUCKET_NAME": "test-bucket",
}
for _key, _value in _test_env.items():
    os.environ.setdefault(_key, _value)

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker, Session
from sqlalchemy.pool import StaticPool
from sqlalchemy.types import TypeDecorator, CHAR
from sqlalchemy.dialects.postgresql import UUID as PostgreSQL_UUID, JSONB, ARRAY as PostgreSQL_ARRAY
from sqlalchemy.types import JSON
import uuid
from datetime import datetime, timezone

from shared.dependencies.db import Base
from modules.user.model.friend_code_model import FriendCode  # noqa: F401
# Character v2 model imports — needed so Base.metadata sees every table
# before SQLite create_all in the db_session fixture.
from modules.characters.model.edition_model import Edition  # noqa: F401
from modules.characters.model.character_model import Character as _CharacterModel  # noqa: F401
from modules.characters.model.character_class_model import CharacterClassEntry as _CCE  # noqa: F401
from modules.characters.model.character_ability_model import CharacterAbilityScore as _CAS  # noqa: F401
from modules.characters.model.character_save_model import CharacterSaveProficiency as _CSP  # noqa: F401
from modules.characters.model.character_skill_model import CharacterSkillProficiency as _CSkill  # noqa: F401
from modules.characters.model.character_feat_model import CharacterFeatAcquisition as _CFA  # noqa: F401
from modules.characters.model.character_choices_log_model import CharacterChoiceLog as _CCL  # noqa: F401
from modules.characters.model.dnd_ability_model import DndAbility as _DndAbility  # noqa: F401
from modules.user.repositories.user_repository import UserRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.characters.repositories.character_repository import CharacterRepository
from modules.friendship.repositories.friendship_repository import FriendshipRepository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.user.domain.user_aggregate import UserAggregate
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.characters.domain.character_aggregate import (
    AbilityScores,
    CharacterAggregate,
    ClassEntry,
)
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate
from modules.campaign.domain.campaign_aggregate import CampaignAggregate


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
            elif isinstance(column.type, JSONB):
                column.type = JSON()
            elif isinstance(column.type, PostgreSQL_ARRAY):
                column.type = JSON()

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
def seed_dnd_abilities(db_session: Session) -> dict[str, int]:
    """Seed the dnd_abilities lookup table for tests that touch character ability rows.

    Returns a name → id map so test factories can populate join tables directly
    without an extra round-trip.
    """
    from modules.characters.model.dnd_ability_model import DndAbility
    names = ("strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma")
    mapping: dict[str, int] = {}
    for name in names:
        row = DndAbility(name=name)
        db_session.add(row)
        db_session.flush()
        mapping[name] = row.id
    db_session.commit()
    return mapping


@pytest.fixture
def seed_default_edition(db_session: Session, seed_dnd_abilities) -> int:
    """Seed the editions table with the default D&D 2024 row; return its id."""
    from modules.characters.model.edition_model import Edition
    edition = Edition(
        code="srd_5_2_1",
        name="D&D 2024 (5.5e)",
        version="5.2.1",
        is_active=True,
    )
    db_session.add(edition)
    db_session.flush()
    db_session.commit()
    return edition.id


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
def create_character(character_repo: CharacterRepository, seed_default_edition):
    """
    Factory fixture to create test characters.

    Usage:
        character = create_character(user_id=user.id, name="Test Hero")
    """
    edition_id = seed_default_edition

    def _create_character(
        user_id: uuid.UUID,
        name: str = "Test Character",
        class_code: str = "fighter",
        species_code: str = "human",
        background_code: str = "soldier",
        level: int = 1,
    ):
        from datetime import datetime
        now = datetime.utcnow()
        character = CharacterAggregate(
            id=None,
            user_id=user_id,
            edition_id=edition_id,
            active_campaign=None,
            character_name=name,
            species_code=species_code,
            background_code=background_code,
            class_entries=[ClassEntry(class_code=class_code, level=level, is_primary=True)],
            ability_scores=AbilityScores.default(),
            save_proficiencies=frozenset(),
            skills=[],
            feats=[],
            level=level,
            xp=0,
            hp_max=10,
            hp_current=10,
            hp_temp=0,
            ac=10,
            death_save_successes=0,
            death_save_failures=0,
            inspiration=False,
            status_effects=[],
            is_alive=True,
            speed=30,
            size="Medium",
            languages=["Common"],
            is_draft=False,
            creation_step=None,
            created_at=now,
            updated_at=now,
        )
        character_repo.save(character)
        return character

    return _create_character


@pytest.fixture
def mock_event_manager():
    """No-op event manager for unit tests (no WebSocket/notifications needed)."""
    from unittest.mock import AsyncMock, MagicMock
    manager = MagicMock()
    manager.broadcast = AsyncMock()
    return manager


@pytest.fixture
def create_friendship(friendship_repo: FriendshipRepository, friend_request_repo, user_repo, mock_event_manager):
    """
    Factory fixture to create test friendships.

    Uses the actual Send+Accept flow (not direct creation).

    Usage:
        friendship = create_friendship(user_a_id=user1.id, user_b_id=user2.id)
    """
    def _create_friendship(user_a_id: uuid.UUID, user_b_id: uuid.UUID):
        import asyncio
        from modules.friendship.application.commands import SendFriendRequest, AcceptFriendRequest

        # User A sends request to User B
        send_cmd = SendFriendRequest(friendship_repo, friend_request_repo, user_repo, mock_event_manager)
        asyncio.get_event_loop().run_until_complete(
            send_cmd.execute(user_id=user_a_id, friend_identifier=str(user_b_id))
        )

        # User B accepts the request
        accept_cmd = AcceptFriendRequest(friendship_repo, friend_request_repo, user_repo, mock_event_manager)
        friendship = asyncio.get_event_loop().run_until_complete(
            accept_cmd.execute(user_id=user_b_id, requester_id=user_a_id)
        )

        return friendship

    return _create_friendship
