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
    session_name: str
    status: str
    dm_id: UUID
    player_ids: List[str]
    moderator_ids: List[str]
    max_players: int
    seat_colors: dict
    current_session_number: int
    session_started_at: Optional[datetime]
    last_activity_at: datetime
    created_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class GameCreate(BaseModel):
    """Schema for creating a new game"""
    session_name: str
    max_players: int = 8
    seat_colors: dict = {}