# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from enum import Enum
from typing import Optional
from uuid import UUID


class FriendshipStatus(str, Enum):
    """Friendship status enumeration"""
    PENDING = "pending"
    ACCEPTED = "accepted"

    def __str__(self) -> str:
        return self.value

    @classmethod
    def from_string(cls, value: str) -> 'FriendshipStatus':
        """Create FriendshipStatus from string value"""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid friendship status: {value}")


class FriendshipAggregate:
    """
    Friendship Aggregate Root

    Manages bidirectional friendship relationships between users.
    Friendship requires acceptance from both parties.

    Workflow:
    1. User A sends request → status = PENDING, user_id = A, friend_id = B
    2. User B accepts → status = ACCEPTED
    3. User B declines → friendship deleted
    4. Either user can remove friendship (unfriend)
    """

    def __init__(
        self,
        user_id: UUID,
        friend_id: UUID,
        status: FriendshipStatus = FriendshipStatus.PENDING,
        created_at: Optional[datetime] = None
    ):
        self.user_id = user_id
        self.friend_id = friend_id
        self.status = status
        self.created_at = created_at if created_at else datetime.utcnow()

    @classmethod
    def create(cls, user_id: UUID, friend_id: UUID) -> 'FriendshipAggregate':
        """
        Create a new friendship request.

        Business Rules:
        - Cannot friend yourself
        - IDs must be valid UUIDs
        """
        if user_id == friend_id:
            raise ValueError("Cannot send friend request to yourself")

        if not user_id or not friend_id:
            raise ValueError("Both user_id and friend_id are required")

        return cls(
            user_id=user_id,
            friend_id=friend_id,
            status=FriendshipStatus.PENDING,
            created_at=datetime.utcnow()
        )

    def accept(self) -> None:
        """
        Accept a pending friendship request.

        Business Rules:
        - Can only accept PENDING friendships
        """
        if self.status != FriendshipStatus.PENDING:
            raise ValueError("Can only accept pending friendship requests")

        self.status = FriendshipStatus.ACCEPTED

    def is_pending(self) -> bool:
        """Check if friendship is pending acceptance"""
        return self.status == FriendshipStatus.PENDING

    def is_accepted(self) -> bool:
        """Check if friendship is accepted"""
        return self.status == FriendshipStatus.ACCEPTED

    def involves_user(self, user_id: UUID) -> bool:
        """Check if a user is part of this friendship"""
        return self.user_id == user_id or self.friend_id == user_id

    def get_other_user(self, user_id: UUID) -> UUID:
        """Get the other user in the friendship"""
        if self.user_id == user_id:
            return self.friend_id
        elif self.friend_id == user_id:
            return self.user_id
        else:
            raise ValueError("User is not part of this friendship")

    def __repr__(self):
        return f"<FriendshipAggregate(user_id={self.user_id}, friend_id={self.friend_id}, status={self.status})>"
