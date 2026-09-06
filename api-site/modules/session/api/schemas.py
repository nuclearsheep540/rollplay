# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, field_validator


class ScheduleSessionRequest(BaseModel):
    """Set (or clear, with null) when the campaign's next game is."""
    scheduled_at: Optional[datetime] = None

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
    """Session aggregate response.

    Unnamed and seatless: a campaign has exactly one session, and the seat count
    is a campaign setting (CampaignResponse.max_players).
    """
    id: UUID
    campaign_id: UUID
    host_id: UUID
    host_name: str  # DM/Host screen name or email
    status: str
    created_at: datetime
    started_at: Optional[datetime]
    stopped_at: Optional[datetime]
    scheduled_at: Optional[datetime]  # The GM's declared next game; null when none
    joined_users: List[UUID]  # Users in session roster
    roster: List[RosterPlayerResponse]  # Enriched roster with character details
    player_count: int  # Count of joined_users

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    """List of sessions"""
    sessions: List[SessionResponse]
    total: int
