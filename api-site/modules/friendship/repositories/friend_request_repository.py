# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from modules.friendship.domain.friend_request_aggregate import FriendRequestAggregate
from modules.friendship.model.friend_request_model import FriendRequestModel


class FriendRequestRepository:
    """
    Repository for Friend Request persistence.

    Handles directional friend request storage and retrieval.
    """

    def __init__(self, db_session: Session):
        self.db = db_session

    def save(self, friend_request: FriendRequestAggregate) -> FriendRequestAggregate:
        """
        Save friend request to database.

        For new requests: INSERT
        For existing requests: UPDATE (though typically requests are immutable)
        """
        existing = self.db.query(FriendRequestModel).filter_by(id=friend_request.id).first()

        if existing:
            # Update (rare case)
            existing.requester_id = friend_request.requester_id
            existing.recipient_id = friend_request.recipient_id
            existing.created_at = friend_request.created_at
        else:
            # Insert new
            model = FriendRequestModel(
                id=friend_request.id,
                requester_id=friend_request.requester_id,
                recipient_id=friend_request.recipient_id,
                created_at=friend_request.created_at
            )
            self.db.add(model)

        self.db.commit()
        return friend_request

    def get_by_id(self, request_id: UUID) -> Optional[FriendRequestAggregate]:
        """Get friend request by ID"""
        model = self.db.query(FriendRequestModel).filter_by(id=request_id).first()
        if not model:
            return None

        return FriendRequestAggregate.from_persistence(
            id=model.id,
            requester_id=model.requester_id,
            recipient_id=model.recipient_id,
            created_at=model.created_at
        )

    def get_by_ids(self, requester_id: UUID, recipient_id: UUID) -> Optional[FriendRequestAggregate]:
        """
        Get friend request by directional IDs.

        Only checks ONE direction (requester → recipient).
        Use get_reverse_request() to check the opposite direction.
        """
        model = self.db.query(FriendRequestModel).filter_by(
            requester_id=requester_id,
            recipient_id=recipient_id
        ).first()

        if not model:
            return None

        return FriendRequestAggregate.from_persistence(
            id=model.id,
            requester_id=model.requester_id,
            recipient_id=model.recipient_id,
            created_at=model.created_at
        )

    def get_reverse_request(self, requester_id: UUID, recipient_id: UUID) -> Optional[FriendRequestAggregate]:
        """
        Check if a reverse request exists (recipient → requester).

        Used for detecting cross-requests (mutual interest).
        """
        return self.get_by_ids(recipient_id, requester_id)

    def get_requests_to_user(self, recipient_id: UUID) -> List[FriendRequestAggregate]:
        """
        Get all incoming friend requests TO a user.

        Returns requests where the user is the recipient.
        Ordered by most recent first.
        """
        models = self.db.query(FriendRequestModel).filter_by(
            recipient_id=recipient_id
        ).order_by(FriendRequestModel.created_at.desc()).all()

        return [
            FriendRequestAggregate.from_persistence(
                id=model.id,
                requester_id=model.requester_id,
                recipient_id=model.recipient_id,
                created_at=model.created_at
            )
            for model in models
        ]

    def get_requests_from_user(self, requester_id: UUID) -> List[FriendRequestAggregate]:
        """
        Get all outgoing friend requests FROM a user.

        Returns requests where the user is the requester.
        Ordered by most recent first.
        """
        models = self.db.query(FriendRequestModel).filter_by(
            requester_id=requester_id
        ).order_by(FriendRequestModel.created_at.desc()).all()

        return [
            FriendRequestAggregate.from_persistence(
                id=model.id,
                requester_id=model.requester_id,
                recipient_id=model.recipient_id,
                created_at=model.created_at
            )
            for model in models
        ]

    def delete(self, requester_id: UUID, recipient_id: UUID) -> bool:
        """
        Delete a friend request (directional).

        Returns True if deleted, False if not found.
        """
        result = self.db.query(FriendRequestModel).filter_by(
            requester_id=requester_id,
            recipient_id=recipient_id
        ).delete()

        self.db.commit()
        return result > 0

    def delete_by_id(self, request_id: UUID) -> bool:
        """
        Delete a friend request by ID.

        Returns True if deleted, False if not found.
        """
        result = self.db.query(FriendRequestModel).filter_by(id=request_id).delete()
        self.db.commit()
        return result > 0
