# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID


class GameStatus(str, Enum):
    """
    Game lifecycle status enumeration.
    
    Games will need to have their state moved from 
    cold storage into an active_session in the game service
    via an ETL to syncronise game state data.

    We use these states to understand the game's status

    Inactive means this game has no current active_session
    Active means this game has an active_session
    Starting means the ETL pipeline has started and we're waiting for an Active state
    Stopping means the ETL pipeline has started and we're waiting for an Inactive state

    """

    INACTIVE = "inactive"
    ACTIVE = "active"
    STARTING = "starting"
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


class GameEntity:
    """
    Game entity within Campaign aggregate

    Stores high level game state
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        name: Optional[str] = None,
        campaign_id: Optional[UUID] = None,
        dungeon_master_id: Optional[UUID] = None,
        status: GameStatus = GameStatus.INACTIVE,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None, # time ETL successfully started the game
        stopped_at: Optional[datetime] = None, # time ETL successfully stopped the game
        session_id: Optional[UUID] = None, # Mongo active_session objectID
        invited_users: Optional[list] = [], # UserID invited to add characters
        player_characters: Optional[list] = [], # Ref user, back pop character
    ):
        self.id = id
        self.name = name
        self.campaign_id = campaign_id
        self.dungeon_master_id = dungeon_master_id
        self.status = status
        self.created_at = created_at
        self.started_at = started_at
        self.stopped_at = stopped_at
        self.session_id = session_id
        self.invited_users = invited_users
        self.player_characters = player_characters

    @classmethod
    def create(cls, name: str, campaign_id: UUID, dm_id: UUID):
        """Create new game with business rules validation"""

        if not campaign_id:
            raise ValueError("Game must belong to a campaign")
        if not dm_id:
            raise ValueError("Game must have a DM")

        normalized_name = name.strip()
        if not name or not normalized_name:
            raise ValueError("Game name is required")
        if len(normalized_name) > 100:
            raise ValueError("Game name too long (max 100 characters)")

        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            campaign_id=campaign_id, # The campaign that spawned this game
            dungeon_master_id=dm_id, # User ID not the character
            status=GameStatus.INACTIVE,
            created_at=datetime.now(),
        )
    
    def invite_user():
        """
        inviting a user will need to await the user
        to choose which character to join with
        """
        ...


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
