# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel, EmailStr
from typing import Optional
from datetime import datetime
from uuid import UUID

class UserResponse(BaseModel):
    """Schema for user data returned by API"""
    id: UUID
    email: str
    screen_name: Optional[str]
    created_at: datetime
    last_login: Optional[datetime]
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class UserCreate(BaseModel):
    """Schema for creating a new user"""
    email: EmailStr
