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


class UpdateGameRequest(BaseModel):
    """Request to update game details"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)


class InviteUserRequest(BaseModel):
    """Request to invite a user to a game"""
    user_id: UUID


class AcceptInviteRequest(BaseModel):
    """Request to accept game invite with character selection"""
    character_id: UUID


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
    invited_users: List[UUID]
    player_characters: List[UUID]
    pending_invites_count: int
    player_count: int

    class Config:
        from_attributes = True


class GameListResponse(BaseModel):
    """List of games"""
    games: List[GameResponse]
    total: int
