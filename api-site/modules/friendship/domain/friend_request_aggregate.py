# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4


class FriendRequestAggregate:
    """
    Friend Request Aggregate

    Represents a directional friend request from requester to recipient.
    Once accepted, this becomes a Friendship (non-directional).
    """

    def __init__(
        self,
        id: Optional[UUID] = None,
        requester_id: Optional[UUID] = None,
        recipient_id: Optional[UUID] = None,
        created_at: Optional[datetime] = None
    ):
        self.id = id if id is not None else uuid4()
        self.requester_id = requester_id
        self.recipient_id = recipient_id
        self.created_at = created_at if created_at is not None else datetime.utcnow()

    @classmethod
    def create(cls, requester_id: UUID, recipient_id: UUID) -> 'FriendRequestAggregate':
        """
        Create a new friend request.

        Business Rules:
        - requester and recipient must be different users
        """
        if not requester_id or not recipient_id:
            raise ValueError("Both requester_id and recipient_id are required")

        if requester_id == recipient_id:
            raise ValueError("Cannot send friend request to yourself")

        return cls(
            requester_id=requester_id,
            recipient_id=recipient_id
        )

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        requester_id: UUID,
        recipient_id: UUID,
        created_at: datetime
    ) -> 'FriendRequestAggregate':
        """Reconstruct aggregate from database"""
        return cls(
            id=id,
            requester_id=requester_id,
            recipient_id=recipient_id,
            created_at=created_at
        )

    def is_requester(self, user_id: UUID) -> bool:
        """Check if user_id is the requester"""
        return self.requester_id == user_id

    def is_recipient(self, user_id: UUID) -> bool:
        """Check if user_id is the recipient"""
        return self.recipient_id == user_id

    def involves_user(self, user_id: UUID) -> bool:
        """Check if user is involved in this request (either side)"""
        return self.is_requester(user_id) or self.is_recipient(user_id)
