# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class FriendshipResponse(BaseModel):
    """Schema for friendship data returned by API"""
    id: UUID
    requester_id: UUID
    addressee_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class FriendRequestCreate(BaseModel):
    """Schema for creating a friend request"""
    screen_name: str

class FriendRequestAction(BaseModel):
    """Schema for accepting/rejecting friend requests"""
    friendship_id: UUID

class FriendResponse(BaseModel):
    """Schema for friend data in lists"""
    id: UUID
    screen_name: Optional[str]
    email: str
    created_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class FriendRequestResponse(BaseModel):
    """Schema for friend request with requester info"""
    id: UUID
    requester_id: UUID
    addressee_id: UUID
    status: str
    created_at: datetime
    updated_at: datetime
    requester: FriendResponse
    
    class Config:
        from_attributes = True  # For SQLAlchemy models