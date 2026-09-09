# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Aggregate - DDD Domain Model

Ubiquitous Language:
- Campaign = the authored story and its assets: the baseline every game starts from
- Session  = who and when (this aggregate): the party and the plan for the next game
- Game     = ONE play, from Start to End — its own aggregate, in modules/game
- Party    = the session's people; a value inside this aggregate, never its own

Every campaign has exactly one session, for its whole life: created with the
campaign, never replaced, never absent. It is the gatekeeper between a campaign,
its people and its games.

**It has no status and no play state.** A session cannot produce a token board,
an adventure log or a screen — only a running game can, and every one of those
now lives on the game that produced it. Liveness is likewise not stored here: a
session is live exactly when it has an open game, which is a question for the
game repository. A cached answer would be a second place asserting one fact.

What it does own is the plan for the next game: when it is (`scheduled_at`) and
what it is called (`next_game_name`). Both are intent about a game that has not
happened, which is why they sit here and not on any game. Start takes the name;
the date is cleared when the host ends the game it described.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID


MAX_NEXT_GAME_NAME_LENGTH = 100


class SessionEntity:
    """
    Session Entity — the campaign's table.

    Roster flow:
    - Users are enrolled in joined_users when the session is created (from the campaign)
    - A user selects a character → tracked in session_joined_users
    - A user enters a game → their character reaches api-game through the start payload
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        campaign_id: Optional[UUID] = None,
        host_id: Optional[UUID] = None,
        created_at: Optional[datetime] = None,
        scheduled_at: Optional[datetime] = None,  # when the next game is — cosmetic, see schedule()
        next_game_name: Optional[str] = None,  # what the next game is called — consumed by Start
        joined_users: Optional[List[UUID]] = None,  # User IDs in roster (auto-enrolled from campaign)
    ):
        self.id = id
        self.campaign_id = campaign_id
        self.host_id = host_id
        self.created_at = created_at
        self.scheduled_at = scheduled_at
        self.next_game_name = next_game_name
        self.joined_users = joined_users if joined_users is not None else []

    @classmethod
    def create(cls, campaign_id: UUID, host_id: UUID):
        """Create the campaign's session with business rules validation.

        Unnamed and seatless by design: a campaign has exactly one session, so a
        name would distinguish nothing, and the seat count is a campaign setting
        (campaigns.max_players) read into every start payload.
        """

        if not campaign_id:
            raise ValueError("Session must belong to a campaign")
        if not host_id:
            raise ValueError("Session must have a host")

        return cls(
            id=None,  # Will be set by repository
            campaign_id=campaign_id,  # The campaign that spawned this session
            host_id=host_id,  # User ID (inherited from campaign host)
            created_at=datetime.utcnow(),
            joined_users=[],
        )

    # --- Roster Management (the party) ---

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

    # --- The plan for the next game ---

    def schedule(self, scheduled_at: Optional[datetime], next_game_name: Optional[str] = None) -> None:
        """Set or clear when the next game is and what it is called.

        Cosmetic and communicative ONLY: nothing starts on this date, nobody is
        reminded, and no rule is enforced by it. It records the table's intent so
        players can align — facilitate, don't enforce, applied to coordination.

        Whether a game is running is not this aggregate's to know, so the
        idle-only rule is enforced by the command, which can ask the game
        repository. What stays here is the shape of the data.

        Raises:
            ValueError: the datetime is naive, or the name is too long. Naive
                values are refused rather than assumed UTC — the whole point is
                that everyone reads the same instant in their own zone.
        """
        if scheduled_at is not None and scheduled_at.tzinfo is None:
            raise ValueError("scheduled_at must be timezone-aware")

        self.scheduled_at = scheduled_at
        self.name_next_game(next_game_name)

    def name_next_game(self, next_game_name: Optional[str]) -> None:
        """Name the game the GM is planning. Blank clears it."""
        if next_game_name is None:
            self.next_game_name = None
            return

        trimmed = next_game_name.strip()
        if len(trimmed) > MAX_NEXT_GAME_NAME_LENGTH:
            raise ValueError(f"Game name must be {MAX_NEXT_GAME_NAME_LENGTH} characters or fewer")

        self.next_game_name = trimmed or None

    def consume_next_game_name(self) -> Optional[str]:
        """Hand the planned name to the game that is starting, and forget it.

        Called by StartGame once the game is live. The name belongs to that game
        from then on: leaving it here would re-apply it to the following game
        too, and a GM editing it afterwards would be editing the plan rather
        than the night that happened.
        """
        name = self.next_game_name
        self.next_game_name = None
        return name

    def clear_schedule(self) -> None:
        """Forget the declared next game — the host has ended the one it named.

        Deliberately unguarded: this runs inside the take-down, so the clear
        lands while the game it described is being closed. Only the date is
        cleared; the name left with the game at Start.
        """
        self.scheduled_at = None
