# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


class SendFriendRequestRequest(BaseModel):
    """Request to send a friend request"""
    friend_uuid: UUID = Field(..., description="UUID of the user to add as friend")


class FriendshipResponse(BaseModel):
    """Friendship response"""
    user_id: UUID
    friend_id: UUID
    status: str
    created_at: datetime
    friend_screen_name: Optional[str] = None  # Populated by endpoint
    friend_email: Optional[str] = None  # Populated by endpoint

    class Config:
        from_attributes = True


class FriendListResponse(BaseModel):
    """List of friendships"""
    friendships: List[FriendshipResponse]
    total: int
