# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field, field_validator

from modules.game.api.schemas import GameResponse
from modules.session.domain.session_aggregate import MAX_NEXT_GAME_NAME_LENGTH


class ScheduleSessionRequest(BaseModel):
    """Set (or clear, with nulls) the plan for the campaign's next game.

    Date and name travel together because they are one plan, set in one dialog:
    a GM who names the night and picks a time should not produce two writes and
    two notifications.
    """
    scheduled_at: Optional[datetime] = None
    next_game_name: Optional[str] = Field(None, max_length=MAX_NEXT_GAME_NAME_LENGTH)

    @field_validator("scheduled_at")
    @classmethod
    def must_be_timezone_aware(cls, value: Optional[datetime]) -> Optional[datetime]:
        """Refuse naive datetimes at the boundary.

        The client sends an instant, not a wall-clock reading: everyone at the
        table is meant to see the same moment rendered in their own zone. A
        naive value would silently be read as server-local and show the wrong
        time to everyone but the server. The aggregate guards this too — this
        one exists to answer the client with a precise 422 rather than a 400.
        """
        if value is not None and value.tzinfo is None:
            raise ValueError("scheduled_at must include a timezone offset")
        return value


class RosterPlayerResponse(BaseModel):
    """Roster player information with character details"""
    user_id: UUID
    username: str  # screen_name or email
    character_id: Optional[UUID] = None
    character_name: Optional[str] = None
    character_level: Optional[int] = None
    character_class: Optional[str] = None
    character_race: Optional[str] = None
    joined_at: datetime


class SessionResponse(BaseModel):
    """Session aggregate response — the campaign's table.

    Unnamed, seatless and statusless: a campaign has exactly one session, the
    seat count is a campaign setting (CampaignResponse.max_players), and
    liveness is `game`. Clients read `game` for "is this running and which room",
    and `games` for the history the drawer lists.
    """
    id: UUID
    campaign_id: UUID
    host_id: UUID
    host_name: str  # DM/Host screen name or email
    created_at: datetime
    scheduled_at: Optional[datetime]  # The GM's declared next game; null when none
    next_game_name: Optional[str] = None  # What the next game is called; null once Start takes it
    game: Optional[GameResponse] = None  # The OPEN game, or null when nothing is running
    # The most recent games played here, newest first — capped, because a
    # campaign gains one per evening for life and this response is built for
    # every session on every dashboard read. games_played is the true total, so
    # the drawer can say how many there are without carrying them all.
    games: List[GameResponse] = []
    games_played: int = 0
    joined_users: List[UUID]  # Users in session roster (the party)
    roster: List[RosterPlayerResponse]  # Enriched roster with character details
    player_count: int  # Count of joined_users

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    """List of sessions"""
    sessions: List[SessionResponse]
    total: int
