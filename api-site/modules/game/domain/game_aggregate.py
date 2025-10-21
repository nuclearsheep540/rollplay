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

    INACTIVE means this game has no current active_session
    ACTIVE means this game has an active_session
    STARTING means the ETL pipeline has started and we're waiting for an Active state
    STOPPING means the ETL pipeline has started and we're waiting for an Inactive state
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


class GameAggregate:
    """
    Game Aggregate Root

    Stores high level game state and manages invite workflow.
    Game is independent from Campaign - Campaign only references Game by ID.

    Invite Workflow:
    1. DM invites User → added to invited_users
    2. User selects Character → moved to player_characters
    3. Invite complete when character joins
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
        invited_users: Optional[List[UUID]] = None,  # User IDs with pending invites
        player_characters: Optional[List[UUID]] = None,  # Character IDs who joined game
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
        self.invited_users = invited_users if invited_users is not None else []
        self.player_characters = player_characters if player_characters is not None else []

    @classmethod
    def create(cls, name: str, campaign_id: UUID, host_id: UUID):
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
            invited_users=[],
            player_characters=[]
        )

    def invite_user(self, user_id: UUID) -> None:
        """
        Invite a user to join the game.
        User must select a character to complete the invite.

        Business Rules:
        - Cannot invite the host
        - Cannot invite user who already has pending invite
        - Cannot invite user whose character is already in game (checked in repository)
        """
        if user_id == self.host_id:
            raise ValueError("Cannot invite the host as a player")

        if user_id in self.invited_users:
            raise ValueError("User already has a pending invite")

        self.invited_users.append(user_id)

    def accept_invite_with_character(self, user_id: UUID, character_id: UUID) -> None:
        """
        User accepts invite by selecting a character.
        Moves user from invited_users to player_characters.

        Business Rules:
        - User must have pending invite
        - Character cannot already be in game
        - Character ownership validated in application layer
        """
        if user_id not in self.invited_users:
            raise ValueError("User does not have a pending invite")

        if character_id in self.player_characters:
            raise ValueError("Character is already in this game")

        # Complete the invite cycle
        self.invited_users.remove(user_id)
        self.player_characters.append(character_id)

    def decline_invite(self, user_id: UUID) -> None:
        """User declines the game invite."""
        if user_id in self.invited_users:
            self.invited_users.remove(user_id)

    def remove_player_character(self, character_id: UUID) -> None:
        """
        Remove a character from the game.
        DM can use this to kick a player.
        """
        if character_id in self.player_characters:
            self.player_characters.remove(character_id)

    def get_pending_invites_count(self) -> int:
        """Get count of pending invites."""
        return len(self.invited_users)

    def get_player_count(self) -> int:
        """Get count of players who have joined with characters."""
        return len(self.player_characters)

    def is_user_invited(self, user_id: UUID) -> bool:
        """Check if user has a pending invite."""
        return user_id in self.invited_users

    def has_character(self, character_id: UUID) -> bool:
        """Check if character is in the game."""
        return character_id in self.player_characters

    def is_active(self) -> bool:
        """Check if game is currently active"""
        return self.status == GameStatus.ACTIVE

    def can_be_deleted(self) -> bool:
        """Business rule: Game can only be deleted if INACTIVE"""
        return self.status == GameStatus.INACTIVE

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

        if self.get_player_count() == 0:
            raise ValueError("Cannot start game with no players")

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
