# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import or_, and_

from modules.friendship.model.friendship_model import Friendship as FriendshipModel
from modules.friendship.domain.friendship_aggregate import FriendshipAggregate, FriendshipStatus


class FriendshipRepository:
    """Repository handling Friendship aggregate persistence"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_ids(self, user_id: UUID, friend_id: UUID) -> Optional[FriendshipAggregate]:
        """Get friendship by both user IDs (order-independent)"""
        model = (
            self.db.query(FriendshipModel)
            .filter(
                or_(
                    and_(FriendshipModel.user_id == user_id, FriendshipModel.friend_id == friend_id),
                    and_(FriendshipModel.user_id == friend_id, FriendshipModel.friend_id == user_id)
                )
            )
            .first()
        )

        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_user_friendships(self, user_id: UUID, status: Optional[FriendshipStatus] = None) -> List[FriendshipAggregate]:
        """Get all friendships for a user, optionally filtered by status"""
        query = self.db.query(FriendshipModel).filter(
            or_(
                FriendshipModel.user_id == user_id,
                FriendshipModel.friend_id == user_id
            )
        )

        if status:
            query = query.filter(FriendshipModel.status == status.value)

        models = query.order_by(FriendshipModel.created_at.desc()).all()
        return [self._model_to_aggregate(model) for model in models]

    def get_pending_requests_to_user(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all pending friend requests sent TO this user (incoming)"""
        models = (
            self.db.query(FriendshipModel)
            .filter(
                FriendshipModel.friend_id == user_id,
                FriendshipModel.status == FriendshipStatus.PENDING.value
            )
            .order_by(FriendshipModel.created_at.desc())
            .all()
        )

        return [self._model_to_aggregate(model) for model in models]

    def get_pending_requests_from_user(self, user_id: UUID) -> List[FriendshipAggregate]:
        """Get all pending friend requests sent BY this user (outgoing)"""
        models = (
            self.db.query(FriendshipModel)
            .filter(
                FriendshipModel.user_id == user_id,
                FriendshipModel.status == FriendshipStatus.PENDING.value
            )
            .order_by(FriendshipModel.created_at.desc())
            .all()
        )

        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: FriendshipAggregate) -> None:
        """Save or update friendship"""
        # Check if friendship already exists
        existing = (
            self.db.query(FriendshipModel)
            .filter(
                or_(
                    and_(FriendshipModel.user_id == aggregate.user_id, FriendshipModel.friend_id == aggregate.friend_id),
                    and_(FriendshipModel.user_id == aggregate.friend_id, FriendshipModel.friend_id == aggregate.user_id)
                )
            )
            .first()
        )

        if existing:
            # Update existing
            existing.status = aggregate.status.value
        else:
            # Create new
            model = FriendshipModel(
                user_id=aggregate.user_id,
                friend_id=aggregate.friend_id,
                status=aggregate.status.value,
                created_at=aggregate.created_at
            )
            self.db.add(model)

        self.db.commit()

    def delete(self, user_id: UUID, friend_id: UUID) -> bool:
        """Delete friendship (unfriend)"""
        deleted = (
            self.db.query(FriendshipModel)
            .filter(
                or_(
                    and_(FriendshipModel.user_id == user_id, FriendshipModel.friend_id == friend_id),
                    and_(FriendshipModel.user_id == friend_id, FriendshipModel.friend_id == user_id)
                )
            )
            .delete(synchronize_session=False)
        )

        self.db.commit()
        return deleted > 0

    def _model_to_aggregate(self, model: FriendshipModel) -> FriendshipAggregate:
        """Convert ORM model to aggregate"""
        return FriendshipAggregate(
            user_id=model.user_id,
            friend_id=model.friend_id,
            status=FriendshipStatus(model.status),
            created_at=model.created_at
        )
