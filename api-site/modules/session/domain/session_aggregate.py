# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Aggregate - DDD Domain Model

Ubiquitous Language:
- Session = The scheduled/planned play instance (this aggregate)
- Game = The live multiplayer experience (handled by api-game service)

A Session is created, started, paused, and finished.
When a Session is ACTIVE, a Game exists in MongoDB (api-game).
"""

from datetime import datetime
from enum import Enum
from typing import List, Optional
from uuid import UUID


class SessionStatus(str, Enum):
    """
    Session lifecycle status enumeration.

    Sessions will need to have their state moved from
    cold storage (PostgreSQL) into an active_session in the game service (MongoDB)
    via an ETL to synchronize session/game state data.

    We use these states to understand the session's lifecycle:

    INACTIVE - Session has no current active game (can be resumed)
    ACTIVE - Session has an active game running
    STARTING - ETL pipeline has started, waiting for ACTIVE state
    STOPPING - ETL pipeline has started, waiting for INACTIVE state
    FINISHED - Session is permanently complete (cannot be resumed, preserved in history)
    """

    INACTIVE = "inactive"
    ACTIVE = "active"
    STARTING = "starting"
    STOPPING = "stopping"
    FINISHED = "finished"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'SessionStatus':
        """Create SessionStatus from string value."""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid session status: {value}")


class SessionEntity:
    """
    Session Entity - Complex Entity within Campaign Aggregate

    Represents a scheduled play session. When ACTIVE, a live game exists
    in MongoDB (api-game service) where players interact in real-time.

    Note: Session is an entity owned by Campaign (ORM in campaign module),
    but has enough behavior to warrant its own application layer module.

    Roster Flow:
    - Users are added to joined_users when session is created (auto-enrolled from campaign)
    - User selects Character → character association tracked in session_joined_users table
    - User enters game → character added to active_session (MongoDB)

    Key Concepts:
    - joined_users: Users in session roster (auto-enrolled from campaign)
    - Character association: Tracked separately in session_joined_users table
    - Active game: Handled by api-game service (MongoDB) when session is ACTIVE
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        name: Optional[str] = None,
        campaign_id: Optional[UUID] = None,
        host_id: Optional[UUID] = None,
        status: SessionStatus = SessionStatus.INACTIVE,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,  # time ETL successfully started the session
        stopped_at: Optional[datetime] = None,  # time ETL successfully stopped the session
        active_game_id: Optional[str] = None,  # MongoDB active_session objectID (when game is running)
        joined_users: Optional[List[UUID]] = None,  # User IDs in roster (auto-enrolled from campaign)
        max_players: int = 8,  # Seat count in active game (1-8)
        audio_config: Optional[dict] = None,  # Persisted audio channel config (tracks, volume, looping)
        map_config: Optional[dict] = None,  # Persisted active map config (just asset_id for ETL restoration)
    ):
        self.id = id
        self.name = name
        self.campaign_id = campaign_id
        self.host_id = host_id
        self.status = status
        self.created_at = created_at
        self.started_at = started_at
        self.stopped_at = stopped_at
        self.active_game_id = active_game_id
        self.joined_users = joined_users if joined_users is not None else []
        self.max_players = self._validate_max_players(max_players)
        self.audio_config = audio_config
        self.map_config = map_config

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
        """Create new session with business rules validation"""

        if not campaign_id:
            raise ValueError("Session must belong to a campaign")
        if not host_id:
            raise ValueError("Session must have a host")

        # Session name is optional - normalize if provided
        normalized_name = name.strip() if name else None
        if normalized_name and len(normalized_name) > 100:
            raise ValueError("Session name too long (max 100 characters)")

        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            campaign_id=campaign_id,  # The campaign that spawned this session
            host_id=host_id,  # User ID (inherited from campaign host)
            status=SessionStatus.INACTIVE,
            created_at=datetime.utcnow(),
            joined_users=[],
            max_players=max_players
        )

    # --- Roster Management ---

    def remove_user(self, user_id: UUID) -> None:
        """
        Remove a user from the session roster.
        Host can use this to kick a player from the roster.
        Character unlocking handled in application layer.
        """
        if user_id in self.joined_users:
            self.joined_users.remove(user_id)

    @property
    def player_count(self) -> int:
        """Count of users in the roster."""
        return len(self.joined_users)

    def has_user(self, user_id: UUID) -> bool:
        """Check if user is in the session roster."""
        return user_id in self.joined_users

    # --- Status Queries ---

    def is_active(self) -> bool:
        """Check if session currently has an active game running"""
        return self.status == SessionStatus.ACTIVE

    def can_delete(self) -> bool:
        """Business rule: Session can only be deleted if INACTIVE or FINISHED"""
        return self.status in [SessionStatus.INACTIVE, SessionStatus.FINISHED]

    # --- Session Lifecycle Methods ---

    def update_name(self, name: str) -> None:
        """Update session name with validation"""
        normalized_name = name.strip()
        if not normalized_name:
            raise ValueError("Session name cannot be empty")
        if len(normalized_name) > 100:
            raise ValueError("Session name too long (max 100 characters)")
        self.name = normalized_name

    def start(self) -> None:
        """
        Begin session start process.
        Sets status to STARTING - ETL pipeline will move to ACTIVE.
        """
        if self.status != SessionStatus.INACTIVE:
            raise ValueError("Can only start sessions that are INACTIVE")

        # Validation removed - Host counts as participant
        # Session can start with just host (0 player characters + 1 DM = valid)
        # Will re-add proper validation when invite system is implemented

        self.status = SessionStatus.STARTING

    def activate(self) -> None:
        """Mark session as ACTIVE (called by ETL after successful start)"""
        if self.status != SessionStatus.STARTING:
            raise ValueError("Can only activate STARTING sessions")

        self.status = SessionStatus.ACTIVE
        self.started_at = datetime.utcnow()

    def pause(self) -> None:
        """
        Begin session pause process.
        Sets status to STOPPING - ETL pipeline will move to INACTIVE.
        """
        if self.status != SessionStatus.ACTIVE:
            raise ValueError("Can only pause sessions that are ACTIVE")

        self.status = SessionStatus.STOPPING

    def deactivate(self) -> None:
        """Mark session as INACTIVE (called by ETL after successful pause)"""
        if self.status != SessionStatus.STOPPING:
            raise ValueError("Can only deactivate STOPPING sessions")

        self.status = SessionStatus.INACTIVE
        self.stopped_at = datetime.utcnow()
        self.active_game_id = None  # Clear MongoDB game reference

    def finish(self) -> None:
        """
        Finish session permanently.
        Can only be called on INACTIVE sessions (must pause first if active).
        Sets status to FINISHED - session cannot be resumed.
        """
        if self.status != SessionStatus.INACTIVE:
            raise ValueError("Can only finish INACTIVE sessions. Pause the session first.")

        self.status = SessionStatus.FINISHED

    def finish_from_active(self) -> None:
        """
        Begin finish process from ACTIVE state.
        Sets status to STOPPING - ETL pipeline will call mark_finished().
        Alternative flow: ACTIVE → finish_from_active() → STOPPING → mark_finished() → FINISHED
        """
        if self.status != SessionStatus.ACTIVE:
            raise ValueError("Can only finish_from_active on ACTIVE sessions")

        self.status = SessionStatus.STOPPING

    def mark_finished(self) -> None:
        """
        Mark session as FINISHED (called by ETL after successful finish from ACTIVE state).
        """
        if self.status != SessionStatus.STOPPING:
            raise ValueError("Can only mark STOPPING sessions as FINISHED")

        self.status = SessionStatus.FINISHED
        self.stopped_at = datetime.utcnow()
        self.active_game_id = None  # Clear MongoDB game reference

    # --- Error Recovery Methods ---

    def abort_start(self) -> None:
        """
        Abort a failed start process. Reverts STARTING → INACTIVE.

        Called when an error occurs after setting STARTING but before ACTIVE.
        This prevents sessions from getting stuck in STARTING state.
        """
        if self.status != SessionStatus.STARTING:
            raise ValueError("Can only abort_start sessions that are STARTING")

        self.status = SessionStatus.INACTIVE

    def abort_stop(self) -> None:
        """
        Abort a failed stop/pause process. Reverts STOPPING → ACTIVE.

        Called when an error occurs after setting STOPPING but before INACTIVE/FINISHED.
        This prevents sessions from getting stuck in STOPPING state.
        """
        if self.status != SessionStatus.STOPPING:
            raise ValueError("Can only abort_stop sessions that are STOPPING")

        self.status = SessionStatus.ACTIVE
