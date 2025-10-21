# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# CAMPAIGN REQUEST SCHEMAS

class CampaignCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class CampaignUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


# GAME REQUEST SCHEMAS

class GameCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    max_players: int = Field(6, ge=1, le=20)


class GameUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    max_players: Optional[int] = Field(None, ge=1, le=20)


class GameStartRequest(BaseModel):
    mongodb_session_id: str = Field(...)


# GAME RESPONSE SCHEMAS

class GameResponse(BaseModel):
    """Game response schema - used for both list and detail views"""
    id: str
    name: str
    campaign_id: str
    host_id: str
    max_players: int
    status: str
    mongodb_session_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    session_duration_seconds: Optional[int] = None


class HostStatusResponse(BaseModel):
    is_host: bool
    game_id: str
    campaign_id: str


# CAMPAIGN RESPONSE SCHEMAS

class CampaignResponse(BaseModel):
    """Full campaign response with games - used for detail view"""
    id: str
    title: str
    description: Optional[str]
    host_id: str
    assets: Optional[dict]
    scenes: Optional[dict]
    npc_factory: Optional[dict]
    created_at: datetime
    updated_at: datetime
    games: List[GameResponse] = []
    player_ids: List[str] = []
    total_games: int = 0
    active_games: int = 0
    player_count: int = 0


class CampaignSummaryResponse(BaseModel):
    """Lightweight campaign response without games - used for list view"""
    id: str
    title: str
    description: Optional[str]
    host_id: str
    created_at: datetime
    updated_at: datetime
    total_games: int = 0
    active_games: int = 0
