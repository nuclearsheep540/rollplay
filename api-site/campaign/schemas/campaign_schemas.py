# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


class CampaignCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="Campaign name")
    description: Optional[str] = Field(None, max_length=500, description="Campaign description")


class CampaignUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="Campaign name")
    description: Optional[str] = Field(None, max_length=500, description="Campaign description")


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
    
    class Config:
        from_attributes = True


class CampaignResponse(BaseModel):
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
    
    @classmethod
    def from_aggregate(cls, aggregate):
        """Create response from Campaign aggregate"""
        from campaign.schemas.game_schemas import GameResponse
        
        games = [GameResponse.from_entity(game) for game in aggregate.games]
        active_games = len(aggregate.get_active_games())
        
        return cls(
            id=str(aggregate.id),
            name=aggregate.name,
            description=aggregate.description,
            dm_id=str(aggregate.dm_id),
            maps=aggregate.maps,
            created_at=aggregate.created_at,
            updated_at=aggregate.updated_at,
            games=games,
            player_ids=[str(player_id) for player_id in aggregate.player_ids],
            total_games=aggregate.get_total_games(),
            active_games=active_games,
            player_count=aggregate.get_player_count()
        )


class CampaignSummaryResponse(BaseModel):
    """Lightweight campaign response without games"""
    id: str
    name: str
    description: Optional[str]
    dm_id: str
    created_at: datetime
    updated_at: datetime
    total_games: int = 0
    active_games: int = 0
    
    @classmethod
    def from_aggregate(cls, aggregate):
        """Create summary response from Campaign aggregate"""
        active_games = len(aggregate.get_active_games())
        
        return cls(
            id=str(aggregate.id),
            name=aggregate.name,
            description=aggregate.description,
            dm_id=str(aggregate.dm_id),
            created_at=aggregate.created_at,
            updated_at=aggregate.updated_at,
            total_games=aggregate.get_total_games(),
            active_games=active_games
        )