# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


class GameCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Game name")
    max_players: int = Field(6, ge=1, le=20, description="Maximum number of players")


class GameUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Game name")
    max_players: Optional[int] = Field(None, ge=1, le=20, description="Maximum number of players")


class GameStartRequest(BaseModel):
    mongodb_session_id: str = Field(..., description="MongoDB session ID for hot storage")


class GameResponse(BaseModel):
    id: str
    name: str
    campaign_id: str
    dm_id: str
    max_players: int
    status: str
    mongodb_session_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    session_duration_seconds: Optional[int] = None
    
    @classmethod
    def from_entity(cls, entity):
        """Create response from Game entity"""
        return cls(
            id=str(entity.id),
            name=entity.name,
            campaign_id=str(entity.campaign_id),
            dm_id=str(entity.dm_id),
            max_players=entity.max_players,
            status=entity.status.value,
            mongodb_session_id=entity.mongodb_session_id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            started_at=entity.started_at,
            ended_at=entity.ended_at,
            session_duration_seconds=entity.get_session_duration()
        )
    
    class Config:
        from_attributes = True


class GameSummaryResponse(BaseModel):
    """Lightweight game response for lists"""
    id: str
    name: str
    campaign_id: str
    status: str
    max_players: int
    created_at: datetime
    session_duration_seconds: Optional[int] = None
    
    @classmethod
    def from_entity(cls, entity):
        """Create summary response from Game entity"""
        return cls(
            id=str(entity.id),
            name=entity.name,
            campaign_id=str(entity.campaign_id),
            status=entity.status.value,
            max_players=entity.max_players,
            created_at=entity.created_at,
            session_duration_seconds=entity.get_session_duration()
        )


class DMStatusResponse(BaseModel):
    is_dm: bool
    game_id: str
    campaign_id: str