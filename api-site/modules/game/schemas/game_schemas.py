# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, Field


class CreateGameRequest(BaseModel):
    """Request to create a new game"""
    name: str = Field(..., min_length=1, max_length=100)
    campaign_id: UUID
    max_players: int = Field(default=8, ge=1, le=8, description="Number of player seats (1-8)")


class UpdateGameRequest(BaseModel):
    """Request to update game details"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class InviteUserRequest(BaseModel):
    """Request to invite a user to a game"""
    user_id: UUID


class AcceptInviteRequest(BaseModel):
    """Request to accept game invite (no character needed)"""
    pass  # No fields needed - user just accepts invite


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


class GameResponse(BaseModel):
    """Game aggregate response"""
    id: UUID
    name: str
    campaign_id: UUID
    host_id: UUID
    status: str
    created_at: datetime
    started_at: Optional[datetime]
    stopped_at: Optional[datetime]
    session_id: Optional[str]
    invited_users: List[UUID]  # Users with pending invites
    joined_users: List[UUID]  # Users who accepted invite (roster) - kept for backward compatibility
    roster: List[RosterPlayerResponse]  # Enriched roster with character details
    pending_invites_count: int  # Count of invited_users
    player_count: int  # Count of joined_users
    max_players: int

    class Config:
        from_attributes = True


class GameListResponse(BaseModel):
    """List of games"""
    games: List[GameResponse]
    total: int
