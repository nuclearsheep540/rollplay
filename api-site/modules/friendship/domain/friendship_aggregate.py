# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4


class FriendshipAggregate:
    """
    Friendship Aggregate Root

    Represents an accepted (mutual) friendship between two users.
    Uses canonical ordering (user1_id < user2_id) to prevent duplicates.

    Note: Pending friend requests are handled by FriendRequestAggregate.
    Once a request is accepted, it becomes a Friendship (this class).
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        user1_id: Optional[UUID] = None,
        user2_id: Optional[UUID] = None,
        created_at: Optional[datetime] = None
    ):
        self.id = id if id is not None else uuid4()
        self.user1_id = user1_id
        self.user2_id = user2_id
        self.created_at = created_at if created_at is not None else datetime.utcnow()

        # Validate canonical ordering
        if self.user1_id and self.user2_id and self.user1_id >= self.user2_id:
            raise ValueError("user1_id must be less than user2_id (canonical ordering)")

    @classmethod
    def create(cls, user_a: UUID, user_b: UUID) -> 'FriendshipAggregate':
        """
        Create a new friendship with canonical ordering.

        Business Rules:
        - Cannot friend yourself
        - Automatically orders user IDs (smaller UUID becomes user1_id)
        """
        if user_a == user_b:
            raise ValueError("Cannot create friendship with yourself")

        if not user_a or not user_b:
            raise ValueError("Both user IDs are required")

        # Apply canonical ordering
        user1_id = min(user_a, user_b)
        user2_id = max(user_a, user_b)

        return cls(
            user1_id=user1_id,
            user2_id=user2_id,
            created_at=datetime.utcnow()
        )

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        user1_id: UUID,
        user2_id: UUID,
        created_at: datetime
    ) -> 'FriendshipAggregate':
        """Reconstruct aggregate from database"""
        return cls(
            id=id,
            user1_id=user1_id,
            user2_id=user2_id,
            created_at=created_at
        )

    def involves_user(self, user_id: UUID) -> bool:
        """Check if a user is part of this friendship"""
        return self.user1_id == user_id or self.user2_id == user_id

    def get_other_user(self, user_id: UUID) -> UUID:
        """
        Get the other user in the friendship.

        Uses canonical ordering - works regardless of which user is provided.
        """
        if self.user1_id == user_id:
            return self.user2_id
        elif self.user2_id == user_id:
            return self.user1_id
        else:
            raise ValueError("User is not part of this friendship")

    def __repr__(self):
        return f"<FriendshipAggregate(id={self.id}, user1_id={self.user1_id}, user2_id={self.user2_id})>"
