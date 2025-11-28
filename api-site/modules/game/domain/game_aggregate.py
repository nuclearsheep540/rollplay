# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID


class GameStatus(str, Enum):
    """
    Game lifecycle status enumeration.

    Games will need to have their state moved from
    cold storage into an active_session in the game service
    via an ETL to synchronize game state data.

    We use these states to understand the game's status

    INACTIVE means this game has no current active_session (can be resumed)
    ACTIVE means this game has an active_session
    STARTING means the ETL pipeline has started and we're waiting for an Active state
    STOPPING means the ETL pipeline has started and we're waiting for an Inactive state
    FINISHED means this session is permanently complete (cannot be resumed, preserved in history)
    """

    INACTIVE = "inactive"
    ACTIVE = "active"
    STARTING = "starting"
    STOPPING = "stopping"
    FINISHED = "finished"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'GameStatus':
        """Create GameStatus from string value."""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid game status: {value}")


class GameAggregate:
    """
    Game Aggregate Root

    Stores high level game state. Game is independent from Campaign -
    Campaign only references Game by ID.

    Roster Flow:
    - Users are added to joined_users when game is created (auto-enrolled from campaign)
    - User selects Character → character association tracked in game_joined_users table
    - User enters session → character added to active_session (MongoDB)

    Key Concepts:
    - joined_users: Users in game roster (auto-enrolled from campaign)
    - Character association: Tracked separately in game_joined_users table
    - Active session: Handled by api-game service (MongoDB)
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        name: Optional[str] = None,
        campaign_id: Optional[UUID] = None,
        host_id: Optional[UUID] = None,
        status: GameStatus = GameStatus.INACTIVE,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,  # time ETL successfully started the game
        stopped_at: Optional[datetime] = None,  # time ETL successfully stopped the game
        session_id: Optional[str] = None,  # MongoDB active_session objectID
        joined_users: Optional[List[UUID]] = None,  # User IDs in roster (auto-enrolled from campaign)
        max_players: int = 8,  # Seat count in active session (1-8)
    ):
        self.id = id
        self.name = name
        self.campaign_id = campaign_id
        self.host_id = host_id
        self.status = status
        self.created_at = created_at
        self.started_at = started_at
        self.stopped_at = stopped_at
        self.session_id = session_id
        self.joined_users = joined_users if joined_users is not None else []
        self.max_players = self._validate_max_players(max_players)

    @staticmethod
    def _validate_max_players(max_players: int) -> int:
        """Validate max_players is within allowed range (1-8)"""
        if not isinstance(max_players, int):
            raise ValueError("max_players must be an integer")
        if max_players < 1 or max_players > 8:
            raise ValueError("max_players must be between 1 and 8")
        return max_players

    @classmethod
    def create(cls, name: str, campaign_id: UUID, host_id: UUID, max_players: int = 8):
        """Create new game with business rules validation"""

        if not campaign_id:
            raise ValueError("Game must belong to a campaign")
        if not host_id:
            raise ValueError("Game must have a host")

        normalized_name = name.strip()
        if not name or not normalized_name:
            raise ValueError("Game name is required")
        if len(normalized_name) > 100:
            raise ValueError("Game name too long (max 100 characters)")

        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            campaign_id=campaign_id,  # The campaign that spawned this game
            host_id=host_id,  # User ID (inherited from campaign host)
            status=GameStatus.INACTIVE,
            created_at=datetime.utcnow(),
            joined_users=[],
            max_players=max_players
        )

    def remove_user(self, user_id: UUID) -> None:
        """
        Remove a user from the game entirely.
        DM can use this to kick a player from the roster.
        Character unlocking handled in application layer.
        """
        if user_id in self.joined_users:
            self.joined_users.remove(user_id)

    def get_player_count(self) -> int:
        """Get count of users in the roster."""
        return len(self.joined_users)

    def is_user_joined(self, user_id: UUID) -> bool:
        """Check if user has joined the game roster."""
        return user_id in self.joined_users

    def is_active(self) -> bool:
        """Check if game is currently active"""
        return self.status == GameStatus.ACTIVE

    def can_be_deleted(self) -> bool:
        """Business rule: Game can only be deleted if INACTIVE or FINISHED"""
        return self.status in [GameStatus.INACTIVE, GameStatus.FINISHED]

    def update_name(self, name: str) -> None:
        """Update game name with validation"""
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Game name cannot be empty")
        if len(normalized_name) > 100:
            raise ValueError("Game name too long (max 100 characters)")
        self.name = normalized_name

    def start_game(self) -> None:
        """
        Begin game start process.
        Sets status to STARTING - ETL pipeline will move to ACTIVE.
        """
        if self.status != GameStatus.INACTIVE:
            raise ValueError("Can only start games that are INACTIVE")

        # Validation removed - DM (host_id) counts as participant
        # Game can start with just DM (0 player characters + 1 DM = valid)
        # Will re-add proper validation when invite system is implemented

        self.status = GameStatus.STARTING

    def mark_active(self) -> None:
        """Mark game as ACTIVE (called by ETL after successful start)"""
        if self.status != GameStatus.STARTING:
            raise ValueError("Can only mark STARTING games as ACTIVE")

        self.status = GameStatus.ACTIVE
        self.started_at = datetime.utcnow()

    def stop_game(self) -> None:
        """
        Begin game stop process.
        Sets status to STOPPING - ETL pipeline will move to INACTIVE.
        """
        if self.status != GameStatus.ACTIVE:
            raise ValueError("Can only stop games that are ACTIVE")

        self.status = GameStatus.STOPPING

    def mark_inactive(self) -> None:
        """Mark game as INACTIVE (called by ETL after successful stop)"""
        if self.status != GameStatus.STOPPING:
            raise ValueError("Can only mark STOPPING games as INACTIVE")

        self.status = GameStatus.INACTIVE
        self.stopped_at = datetime.utcnow()
        self.session_id = None  # Clear MongoDB session reference

    def finish_session(self) -> None:
        """
        Finish session permanently.
        Can only be called on INACTIVE sessions (must pause first if active).
        Sets status to FINISHED - session cannot be resumed.
        """
        if self.status != GameStatus.INACTIVE:
            raise ValueError("Can only finish INACTIVE sessions. Pause the session first.")

        self.status = GameStatus.FINISHED

    def mark_finished(self) -> None:
        """
        Mark game as FINISHED (called by ETL after successful finish from ACTIVE state).
        Alternative flow: ACTIVE → finish_from_active() → STOPPING → mark_finished() → FINISHED
        """
        if self.status != GameStatus.STOPPING:
            raise ValueError("Can only mark STOPPING games as FINISHED")

        self.status = GameStatus.FINISHED
        self.stopped_at = datetime.utcnow()
        self.session_id = None  # Clear MongoDB session reference
