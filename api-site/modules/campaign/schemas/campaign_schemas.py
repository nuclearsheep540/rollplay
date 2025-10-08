# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# REQUEST SCHEMAS

class CampaignCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


class CampaignUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


# RESPONSE SCHEMAS

class GameResponse(BaseModel):
    """Embedded game response in campaign details"""
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


class CampaignResponse(BaseModel):
    """Full campaign response with games - used for detail view"""
    id: str
    name: str
    description: Optional[str]
    dm_id: str
    maps: Optional[str]
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
    name: str
    description: Optional[str]
    dm_id: str
    created_at: datetime
    updated_at: datetime
    total_games: int = 0
    active_games: int = 0
