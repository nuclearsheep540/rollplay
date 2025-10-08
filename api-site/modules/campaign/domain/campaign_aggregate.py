# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID


class GameStatus(str, Enum):
    """Game lifecycle status enumeration."""

    INACTIVE = "inactive"
    STARTING = "starting"
    ACTIVE = "active"
    STOPPING = "stopping"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'GameStatus':
        """Create GameStatus from string value."""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid game status: {value}")

    def can_transition_to(self, target_status: 'GameStatus') -> bool:
        """Check if transition to target status is valid."""
        valid_transitions = {
            GameStatus.INACTIVE: [GameStatus.STARTING],
            GameStatus.STARTING: [GameStatus.ACTIVE, GameStatus.INACTIVE],  # INACTIVE for rollback
            GameStatus.ACTIVE: [GameStatus.STOPPING],
            GameStatus.STOPPING: [GameStatus.INACTIVE]
        }

        return target_status in valid_transitions.get(self, [])

    def requires_hot_storage(self) -> bool:
        """Check if this status requires hot storage to exist."""
        return self in [GameStatus.STARTING, GameStatus.ACTIVE, GameStatus.STOPPING]

    def allows_campaign_configuration(self) -> bool:
        """Check if campaign can be configured in this status."""
        return self == GameStatus.INACTIVE


class GameEntity:
    """Game entity within Campaign aggregate - not a root aggregate"""

    def __init__(
        self,
        id: Optional[UUID] = None,
        name: Optional[str] = None,
        campaign_id: Optional[UUID] = None,
        dm_id: Optional[UUID] = None,
        max_players: int = 6,
        status: GameStatus = GameStatus.INACTIVE,
        mongodb_session_id: Optional[str] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,
        ended_at: Optional[datetime] = None
    ):
        self.id = id
        self.name = name
        self.campaign_id = campaign_id
        self.dm_id = dm_id
        self.max_players = max_players
        self.status = status
        self.mongodb_session_id = mongodb_session_id
        self.created_at = created_at
        self.updated_at = updated_at
        self.started_at = started_at
        self.ended_at = ended_at

    @classmethod
    def create(cls, name: str, campaign_id: UUID, dm_id: UUID, max_players: int = 6):
        """Create new game with business rules validation"""
        # Business rule: Game name must be provided
        if not name or not name.strip():
            raise ValueError("Game name is required")

        normalized_name = name.strip()
        if len(normalized_name) > 100:
            raise ValueError("Game name too long (max 100 characters)")

        # Business rule: Must belong to campaign and have DM
        if not campaign_id:
            raise ValueError("Game must belong to a campaign")
        if not dm_id:
            raise ValueError("Game must have a DM")

        # Business rule: Max players validation
        if max_players < 1 or max_players > 20:
            raise ValueError("Max players must be between 1 and 20")

        now = datetime.utcnow()
        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            campaign_id=campaign_id, # The campaign that spawned this game
            dm_id=dm_id, # User ID not the character
            max_players=max_players,
            status=GameStatus.INACTIVE,
            mongodb_session_id=None,
            created_at=now,
            updated_at=now,
            started_at=None,
            ended_at=None
        )

    def start_session(self, mongodb_session_id: str):
        """Start the game session - transitions to hot storage"""
        # Business rule: Can only start INACTIVE games
        if self.status != GameStatus.INACTIVE:
            raise ValueError(f"Cannot start game in {self.status.value} state")

        if not mongodb_session_id:
            raise ValueError("MongoDB session ID required to start game")

        # Use proper transition through STARTING to ACTIVE
        if not self.status.can_transition_to(GameStatus.STARTING):
            raise ValueError(f"Invalid transition from {self.status.value} to starting")

        self.status = GameStatus.STARTING
        self.mongodb_session_id = mongodb_session_id
        self.started_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()

    def activate_session(self):
        """Complete session startup - move from STARTING to ACTIVE"""
        if self.status != GameStatus.STARTING:
            raise ValueError(f"Cannot activate game in {self.status.value} state")

        if not self.status.can_transition_to(GameStatus.ACTIVE):
            raise ValueError(f"Invalid transition from {self.status.value} to active")

        self.status = GameStatus.ACTIVE
        self.updated_at = datetime.utcnow()

    def end_session(self):
        """End the game session - transitions back to cold storage"""
        # Business rule: Can only end ACTIVE games
        if self.status != GameStatus.ACTIVE:
            raise ValueError(f"Cannot end game in {self.status.value} state")

        if not self.status.can_transition_to(GameStatus.STOPPING):
            raise ValueError(f"Invalid transition from {self.status.value} to stopping")

        self.status = GameStatus.STOPPING
        self.updated_at = datetime.utcnow()

    def complete_shutdown(self):
        """Complete session shutdown - move from STOPPING to INACTIVE"""
        if self.status != GameStatus.STOPPING:
            raise ValueError(f"Cannot complete shutdown in {self.status.value} state")

        if not self.status.can_transition_to(GameStatus.INACTIVE):
            raise ValueError(f"Invalid transition from {self.status.value} to inactive")

        self.status = GameStatus.INACTIVE
        self.ended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        # Note: mongodb_session_id kept for potential recovery/audit

    def update_details(self, name: Optional[str] = None, max_players: Optional[int] = None):
        """Update game details with business rules"""
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Game name cannot be empty")
            if len(normalized_name) > 100:
                raise ValueError("Game name too long (max 100 characters)")
            self.name = normalized_name

        if max_players is not None:
            if max_players < 1 or max_players > 20:
                raise ValueError("Max players must be between 1 and 20")
            self.max_players = max_players

        self.updated_at = datetime.utcnow()

    def is_active(self) -> bool:
        """Check if game is currently active"""
        return self.status == GameStatus.ACTIVE

    def is_inactive(self) -> bool:
        """Check if game is inactive"""
        return self.status == GameStatus.INACTIVE

    def is_starting(self) -> bool:
        """Check if game is starting up"""
        return self.status == GameStatus.STARTING

    def is_stopping(self) -> bool:
        """Check if game is shutting down"""
        return self.status == GameStatus.STOPPING

    def can_be_deleted(self) -> bool:
        """Business rule: Games can only be deleted if INACTIVE"""
        return self.status == GameStatus.INACTIVE

    def can_be_started(self) -> bool:
        """Business rule: Games can only be started if INACTIVE"""
        return self.status == GameStatus.INACTIVE

    def can_be_ended(self) -> bool:
        """Business rule: Games can only be ended if ACTIVE"""
        return self.status == GameStatus.ACTIVE

    def requires_hot_storage(self) -> bool:
        """Check if game requires MongoDB hot storage"""
        return self.status.requires_hot_storage()

    def get_session_duration(self) -> Optional[int]:
        """Get session duration in seconds if game has been started"""
        if not self.started_at:
            return None

        end_time = self.ended_at or datetime.utcnow()
        return int((end_time - self.started_at).total_seconds())


@dataclass
class CampaignAggregate:
    id: Optional[UUID]
    name: str
    description: str
    dm_id: UUID
    created_at: datetime
    updated_at: datetime
    maps: Optional[str]
    games: List[GameEntity] = field(default_factory=list)
    player_ids: List[UUID] = field(default_factory=list)

    @classmethod
    def create(cls, name: str, description: str, dm_id: UUID):
        """Create new campaign with business rules validation"""
        # Business rule: Campaign name must be provided and valid
        if not name or not name.strip():
            raise ValueError("Campaign name is required")

        normalized_name = name.strip()
        if len(normalized_name) > 100:
            raise ValueError("Campaign name too long (max 100 characters)")

        # Business rule: Description is optional but has length limit
        normalized_description = description.strip() if description else ""
        if len(normalized_description) > 500:
            raise ValueError("Campaign description too long (max 500 characters)")

        # Business rule: DM must be specified
        if not dm_id:
            raise ValueError("Campaign must have a DM")

        now = datetime.utcnow()
        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            description=normalized_description,
            dm_id=dm_id,
            created_at=now,
            updated_at=now,
            maps=None,
            games=[],
            player_ids=[]
        )

    def add_game(self, name: str, max_players: int = 6) -> GameEntity:
        """Add a new game to this campaign"""
        # Business rule: Game name must be unique within campaign
        if any(game.name.lower() == name.lower() for game in self.games):
            raise ValueError(f"Game '{name}' already exists in this campaign")

        # Business rule: Campaign can have maximum games (configurable)
        max_games_per_campaign = 20  # Business policy
        if len(self.games) >= max_games_per_campaign:
            raise ValueError(f"Campaign cannot exceed {max_games_per_campaign} games")

        # Create game entity through factory
        game = GameEntity.create(
            name=name,
            campaign_id=self.id,
            dm_id=self.dm_id,
            max_players=max_players
        )

        self.games.append(game)
        self.update_timestamp()
        return game

    def remove_game(self, game_id: UUID) -> bool:
        """Remove a game from this campaign"""
        # Business rule: Can only remove games that are INACTIVE
        game = self.get_game_by_id(game_id)
        if not game:
            return False

        if not game.can_be_deleted():
            raise ValueError("Cannot delete game - it must be INACTIVE")

        self.games = [g for g in self.games if g.id != game_id]
        self.update_timestamp()
        return True

    def get_game_by_id(self, game_id: UUID) -> Optional[GameEntity]:
        """Find game by ID within this campaign"""
        return next((game for game in self.games if game.id == game_id), None)

    def update_details(self, name: Optional[str] = None, description: Optional[str] = None):
        """Update campaign details with business rules"""
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Campaign name cannot be empty")
            if len(normalized_name) > 100:
                raise ValueError("Campaign name too long (max 100 characters)")
            self.name = normalized_name

        if description is not None:
            normalized_description = description.strip()
            if len(normalized_description) > 500:
                raise ValueError("Campaign description too long (max 500 characters)")
            self.description = normalized_description

        self.update_timestamp()

    def update_timestamp(self):
        """Update the last modified timestamp"""
        self.updated_at = datetime.utcnow()

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if campaign is owned by specific user"""
        return self.dm_id == user_id

    def get_active_games(self) -> List[GameEntity]:
        """Get all active games in this campaign"""
        return [game for game in self.games if game.is_active()]

    def get_total_games(self) -> int:
        """Get total number of games in campaign"""
        return len(self.games)

    def can_be_deleted(self) -> bool:
        """Business rule: Campaign can only be deleted if no active games"""
        return len(self.get_active_games()) == 0

    def add_player(self, user_id: UUID) -> None:
        """Add a player to this campaign"""
        # Business rule: Cannot add DM as player
        if user_id == self.dm_id:
            raise ValueError("DM cannot be added as a player")

        # Business rule: Player must be unique
        if user_id in self.player_ids:
            raise ValueError("User is already a player in this campaign")

        self.player_ids.append(user_id)
        self.update_timestamp()

    def remove_player(self, user_id: UUID) -> None:
        """Remove a player from this campaign"""
        if user_id in self.player_ids:
            self.player_ids.remove(user_id)
            self.update_timestamp()

    def is_member(self, user_id: UUID) -> bool:
        """Check if user is either DM or player in this campaign"""
        return self.is_owned_by(user_id) or user_id in self.player_ids

    def is_player(self, user_id: UUID) -> bool:
        """Check if user is a player (not DM) in this campaign"""
        return user_id in self.player_ids

    def get_player_count(self) -> int:
        """Get total number of players (excluding DM)"""
        return len(self.player_ids)

    def get_all_member_ids(self) -> List[UUID]:
        """Get all member IDs (DM + players)"""
        return [self.dm_id] + self.player_ids
