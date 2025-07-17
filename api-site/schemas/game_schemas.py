# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class GameResponse(BaseModel):
    """Schema for game data returned by API"""
    id: UUID
    campaign_id: UUID
    name: Optional[str]
    status: str
    dm_id: UUID
    party: List[dict]
    max_players: int
    location: Optional[str]
    current_session_number: int
    combat_active: bool
    turn_order: List[dict]
    adventure_logs: List[dict]
    total_play_time: int
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    last_activity_at: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy models
        
    @classmethod
    def from_orm(cls, obj):
        """Custom from_orm to handle enum serialization"""
        return cls(
            id=obj.id,
            campaign_id=obj.campaign_id,
            name=obj.name,
            status=str(obj.status),  # Convert enum to string
            dm_id=obj.dm_id,
            party=obj.party or [],
            max_players=obj.max_players,
            location=obj.location,
            current_session_number=obj.current_session_number,
            combat_active=obj.combat_active,
            turn_order=obj.turn_order or [],
            adventure_logs=obj.adventure_logs or [],
            total_play_time=obj.total_play_time,
            started_at=obj.started_at,
            ended_at=obj.ended_at,
            last_activity_at=obj.last_activity_at,
            created_at=obj.created_at
        )

class GameCreate(BaseModel):
    """Schema for creating a new game"""
    name: str
    max_players: int = 8