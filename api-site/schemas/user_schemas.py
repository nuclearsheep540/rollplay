# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class UserResponse(BaseModel):
    """Schema for user data returned by API"""
    id: UUID
    email: str
    screen_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    temp_game_ids: Optional[List[str]] = []
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class UserCreate(BaseModel):
    """Schema for creating a new user"""
    email: EmailStr

class ScreenNameUpdate(BaseModel):
    """Schema for updating user's screen name"""
    screen_name: str
    
    class Config:
        # Validation
        min_anystr_length = 1
        max_anystr_length = 50
