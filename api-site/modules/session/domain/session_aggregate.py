# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Aggregate - DDD Domain Model

Ubiquitous Language:
- Session = The scheduled/planned play instance (this aggregate)
- Game = The live multiplayer experience (handled by api-game service)

Every campaign has exactly one session, for its whole life: created with the
campaign, replaced wholesale by a reset, never absent. It is started and ended
(ended is spelled `pause` here — see PauseReason) over and over.
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

    INACTIVE - No game running. The only resting state: a game the host ended,
               a game the system paused, and a session that has never been played
               are all indistinguishable here, deliberately.
    ACTIVE - Session has an active game running
    STARTING - ETL pipeline has started, waiting for ACTIVE state
    STOPPING - ETL pipeline has started, waiting for INACTIVE state

    There is no terminal state. FINISHED was retired (2026-09) because it forced a
    NEW session row for the next game, and pc tokens live only on the previous
    board — so every "finish" silently stranded the players' pieces.
    """

    INACTIVE = "inactive"
    ACTIVE = "active"
    STARTING = "starting"
    STOPPING = "stopping"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'SessionStatus':
        """Create SessionStatus from string value."""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid session status: {value}")


class PauseReason(str, Enum):
    """Why a game is being taken down — the two are indistinguishable in status
    (both land INACTIVE) but differ in what the players are told.

    HOST_ENDED - the GM pressed End game. Players get a toast; the schedule clears.
    SYSTEM - the expiry sweeper or an admin closed an abandoned game. Silent: from
             the user's side nothing happened, and the next Start reads identically.
    """

    HOST_ENDED = "host_ended"
    SYSTEM = "system"

    def __str__(self) -> str:
        return self.value


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
        campaign_id: Optional[UUID] = None,
        host_id: Optional[UUID] = None,
        status: SessionStatus = SessionStatus.INACTIVE,
        created_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,  # time ETL successfully started the session
        stopped_at: Optional[datetime] = None,  # time ETL successfully stopped the session
        urls_expire_at: Optional[datetime] = None,  # signed asset-URL lease deadline, stamped at signing time in StartSession
        scheduled_at: Optional[datetime] = None,  # the GM's declared next game — cosmetic, see schedule()
        joined_users: Optional[List[UUID]] = None,  # User IDs in roster (auto-enrolled from campaign)
        audio_config: Optional[dict] = None,  # Persisted audio channel config (tracks, volume, looping)
        spotify_config: Optional[dict] = None,  # Persisted DM Spotify BGM block (track/context/level) for ETL restoration
        map_config: Optional[dict] = None,  # Persisted active map config (just asset_id for ETL restoration)
        image_config: Optional[dict] = None,  # Persisted active image config (asset_id for ETL restoration)
        active_display: Optional[str] = None,  # Which display was active: "map", "image", or None
        adventure_log: Optional[list] = None,  # Persisted adventure log (LogEntry-shaped dicts, ≤200) for ETL restoration
        map_token_state: Optional[dict] = None,  # Persisted token boards (asset_id -> list[MapToken dicts]) for ETL restoration
        map_token_seed: Optional[dict] = None,  # Board-as-seeded snapshot per map — the start merge's diff base (decision 24)
    ):
        self.id = id
        self.campaign_id = campaign_id
        self.host_id = host_id
        self.status = status
        self.created_at = created_at
        self.started_at = started_at
        self.stopped_at = stopped_at
        self.urls_expire_at = urls_expire_at
        self.scheduled_at = scheduled_at
        self.joined_users = joined_users if joined_users is not None else []
        self.audio_config = audio_config
        self.spotify_config = spotify_config
        self.map_config = map_config
        self.image_config = image_config
        self.active_display = active_display
        self.adventure_log = adventure_log
        self.map_token_state = map_token_state
        self.map_token_seed = map_token_seed

    @property
    def is_locked(self) -> bool:
        """
        A session is locked if it has an active game or
        is in a transitioning state.
        """
        return self.status in {
            SessionStatus.ACTIVE,
            SessionStatus.STARTING,
            SessionStatus.STOPPING
        }

    @classmethod
    def create(cls, campaign_id: UUID, host_id: UUID):
        """Create the campaign's session with business rules validation.

        Unnamed and seatless by design: a campaign has exactly one session, so a
        name would distinguish nothing, and the seat count is a campaign setting
        (campaigns.max_players) read into the start payload.
        """

        if not campaign_id:
            raise ValueError("Session must belong to a campaign")
        if not host_id:
            raise ValueError("Session must have a host")

        return cls(
            id=None,  # Will be set by repository
            campaign_id=campaign_id,  # The campaign that spawned this session
            host_id=host_id,  # User ID (inherited from campaign host)
            status=SessionStatus.INACTIVE,
            created_at=datetime.utcnow(),
            joined_users=[],
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
        """Business rule: a session can only be deleted while no game is running.

        Deletion is how a reset wipes play state, and how a campaign takes its
        session with it — neither may happen under a live game.
        """
        return self.status == SessionStatus.INACTIVE

    # --- Asset Reference Management ---

    def remove_asset_references(self, asset_id_str: str) -> bool:
        """Remove all references to a deleted asset from session configs.
        Returns True if any references were removed."""
        changed = False

        # Audio config: remove channels referencing this asset
        if self.audio_config:
            channels_to_remove = [
                ch_id for ch_id, ch in self.audio_config.items()
                if ch.get("asset_id") == asset_id_str
            ]
            for ch_id in channels_to_remove:
                del self.audio_config[ch_id]
                changed = True

        # Map config: clear if it references this asset
        if self.map_config and self.map_config.get("asset_id") == asset_id_str:
            self.map_config = {}
            if self.active_display == "map":
                self.active_display = None
            changed = True

        # Image config: clear if it references this asset
        if self.image_config and self.image_config.get("asset_id") == asset_id_str:
            self.image_config = {}
            if self.active_display == "image":
                self.active_display = None
            changed = True

        return changed

    # --- Session Lifecycle Methods ---

    # --- Scheduling ---

    def schedule(self, scheduled_at: Optional[datetime]) -> None:
        """Set or clear when the next game is. None clears it.

        Cosmetic and communicative ONLY: nothing starts on this date, nobody is
        reminded, and no rule is enforced by it. It records the table's intent so
        players can align — facilitate, don't enforce, applied to coordination.

        Editable only while no game is running: changing "the next game" while
        this one is in progress would be describing a game that is happening.

        Raises:
            ValueError: a game is running, or the datetime is naive. Naive values
                are refused rather than assumed UTC — the whole point is that
                everyone reads the same instant in their own zone.
        """
        if self.status != SessionStatus.INACTIVE:
            raise ValueError("End the game before changing the schedule")
        if scheduled_at is not None and scheduled_at.tzinfo is None:
            raise ValueError("scheduled_at must be timezone-aware")

        self.scheduled_at = scheduled_at

    def clear_schedule(self) -> None:
        """Forget the declared next game — the host has ended the one it named.

        Deliberately unguarded on status: this runs mid-STOPPING, inside the
        take-down, so the clear lands in the same write as the extracted state.
        """
        self.scheduled_at = None

    # --- Session Lifecycle Methods ---

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

    def activate(self, urls_expire_at: Optional[datetime] = None) -> None:
        """Mark session as ACTIVE (called only after api-game confirms the game is up).

        ACTIVE is the record that hot state exists in api-game; the game is keyed by
        this session's own id, so there is no separate game reference to store.

        urls_expire_at is the signed asset-URL lease deadline, computed at signing time
        (a few seconds before this call) — the expiry sweeper auto-pauses past it.
        """
        if self.status != SessionStatus.STARTING:
            raise ValueError("Can only activate STARTING sessions")

        self.status = SessionStatus.ACTIVE
        self.started_at = datetime.utcnow()
        self.urls_expire_at = urls_expire_at

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
        self.urls_expire_at = None  # Lease ends with the game; re-stamped on next start

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

        Called when an error occurs after setting STOPPING but before INACTIVE.
        This prevents sessions from getting stuck in STOPPING state.
        """
        if self.status != SessionStatus.STOPPING:
            raise ValueError("Can only abort_stop sessions that are STOPPING")

        self.status = SessionStatus.ACTIVE
