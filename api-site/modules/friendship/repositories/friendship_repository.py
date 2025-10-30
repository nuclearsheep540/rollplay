# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_, func

from modules.friendship.model.friendship_model import FriendshipModel
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate


class FriendshipRepository:
    """
    Repository for Friendship persistence.

    Handles non-directional friendship storage with canonical ordering.
    """

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, friendship_id: UUID) -> Optional[FriendshipAggregate]:
        """Get friendship by ID"""
        model = self.db.query(FriendshipModel).filter_by(id=friendship_id).first()
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_canonical_ids(self, user_a: UUID, user_b: UUID) -> Optional[FriendshipAggregate]:
        """
        Get friendship by user IDs (order-independent).

        Uses canonical ordering: searches for (min, max) tuple.
        """
        user1_id = min(user_a, user_b)
        user2_id = max(user_a, user_b)

        model = self.db.query(FriendshipModel).filter_by(
            user1_id=user1_id,
            user2_id=user2_id
        ).first()

        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_user_friendships(self, user_id: UUID) -> List[FriendshipAggregate]:
        """
        Get all friendships for a user.

        Simple query - no status filter needed (presence = accepted).
        """
        models = self.db.query(FriendshipModel).filter(
            or_(
                FriendshipModel.user1_id == user_id,
                FriendshipModel.user2_id == user_id
            )
        ).order_by(FriendshipModel.created_at.desc()).all()

        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: FriendshipAggregate) -> FriendshipAggregate:
        """
        Save friendship to database.

        Validates canonical ordering before insert.
        """
        # Validate canonical ordering
        if aggregate.user1_id >= aggregate.user2_id:
            raise ValueError("Friendship must have user1_id < user2_id (canonical ordering)")

        # Check if friendship already exists by ID
        existing = self.db.query(FriendshipModel).filter_by(id=aggregate.id).first()

        if existing:
            # Update (rare case - friendships are usually immutable once created)
            existing.user1_id = aggregate.user1_id
            existing.user2_id = aggregate.user2_id
            existing.created_at = aggregate.created_at
        else:
            # Insert new
            model = FriendshipModel(
                id=aggregate.id,
                user1_id=aggregate.user1_id,
                user2_id=aggregate.user2_id,
                created_at=aggregate.created_at
            )
            self.db.add(model)

        self.db.commit()
        return aggregate

    def delete(self, user_a: UUID, user_b: UUID) -> bool:
        """
        Delete friendship (unfriend) by user IDs.

        Uses canonical ordering for lookup.
        Returns True if deleted, False if not found.
        """
        user1_id = min(user_a, user_b)
        user2_id = max(user_a, user_b)

        result = self.db.query(FriendshipModel).filter_by(
            user1_id=user1_id,
            user2_id=user2_id
        ).delete()

        self.db.commit()
        return result > 0

    def delete_by_id(self, friendship_id: UUID) -> bool:
        """
        Delete friendship by ID.

        Returns True if deleted, False if not found.
        """
        result = self.db.query(FriendshipModel).filter_by(id=friendship_id).delete()
        self.db.commit()
        return result > 0

    def _model_to_aggregate(self, model: FriendshipModel) -> FriendshipAggregate:
        """Convert ORM model to aggregate"""
        return FriendshipAggregate.from_persistence(
            id=model.id,
            user1_id=model.user1_id,
            user2_id=model.user2_id,
            created_at=model.created_at
        )
