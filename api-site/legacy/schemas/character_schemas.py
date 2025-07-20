# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class CharacterResponse(BaseModel):
    """Schema for character data returned by API"""
    id: UUID
    user_id: UUID
    name: str
    race: str
    character_class: str
    level: int
    created_at: datetime
    last_played: Optional[datetime]
    campaign_id: Optional[UUID]
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class CharacterCreate(BaseModel):
    """Schema for creating a new character"""
    name: str
    race: str
    character_class: str
    level: int = 1