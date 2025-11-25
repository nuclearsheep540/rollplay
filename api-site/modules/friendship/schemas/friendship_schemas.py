# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, Field


class SendFriendRequestRequest(BaseModel):
    """Request to send a friend request"""
    friend_identifier: str = Field(..., description="UUID or friend code (e.g., ABCD-1234) of the user to add as friend")


class FriendRequestResponse(BaseModel):
    """
    Friend request response.

    For incoming requests: shows requester info
    For outgoing requests: shows recipient info
    """
    id: UUID
    requester_id: UUID
    recipient_id: UUID
    requester_screen_name: Optional[str] = None  # For incoming requests
    recipient_screen_name: Optional[str] = None  # For outgoing requests
    created_at: datetime

    class Config:
        from_attributes = True


class FriendshipResponse(BaseModel):
    """
    Friendship response - simplified with computed friend_id.

    The friend_id field represents the "other user" (computed by endpoint).
    """
    id: UUID
    friend_id: UUID  # The OTHER user in the friendship (computed)
    friend_screen_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class CategorizedFriendListResponse(BaseModel):
    """
    Categorized list of all user friendships and friend requests.

    Clear separation between:
    - accepted: Actual friendships (mutual, accepted)
    - incoming_requests: Pending requests TO the user
    - outgoing_requests: Pending requests FROM the user
    """
    accepted: List[FriendshipResponse]
    incoming_requests: List[FriendRequestResponse]
    outgoing_requests: List[FriendRequestResponse]
    total_accepted: int
    total_incoming: int
    total_outgoing: int
