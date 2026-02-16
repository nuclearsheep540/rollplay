# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class CreateSessionRequest(BaseModel):
    """Request to create a new session"""
    name: Optional[str] = Field(None, max_length=100)
    campaign_id: UUID
    max_players: int = Field(default=8, ge=1, le=8, description="Number of player seats (1-8)")


class UpdateSessionRequest(BaseModel):
    """Request to update session details"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)


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
    """Session aggregate response"""
    id: UUID
    name: Optional[str]
    campaign_id: UUID
    host_id: UUID
    host_name: str  # DM/Host screen name or email
    status: str
    created_at: datetime
    started_at: Optional[datetime]
    stopped_at: Optional[datetime]
    active_game_id: Optional[str]  # MongoDB ObjectID when game is running
    joined_users: List[UUID]  # Users in session roster
    roster: List[RosterPlayerResponse]  # Enriched roster with character details
    player_count: int  # Count of joined_users
    max_players: int

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    """List of sessions"""
    sessions: List[SessionResponse]
    total: int
