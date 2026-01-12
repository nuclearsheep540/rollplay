# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from typing import Optional, List
from uuid import UUID
from datetime import datetime, timedelta

from modules.events.model.notification_model import Notification as NotificationModel
from modules.events.domain.notification_aggregate import NotificationAggregate


class NotificationRepository:
    """Repository for Notification aggregate data access with inline ORM conversion."""

    def __init__(self, db_session: Session):
        self.db = db_session

    def save(self, notification: NotificationAggregate) -> NotificationAggregate:
        """
        Persist notification to database.

        Args:
            notification: NotificationAggregate to save

        Returns:
            NotificationAggregate: Saved notification with ID populated
        """
        if notification.id:
            model = self.db.query(NotificationModel).filter_by(id=notification.id).first()
            if model:
                model.read = notification.read
                self.db.commit()
                self.db.refresh(model)
        else:
            model = NotificationModel(
                user_id=notification.user_id,
                event_type=notification.event_type,
                data=notification.data,
                read=notification.read,
                created_at=notification.created_at
            )
            self.db.add(model)
            self.db.commit()
            self.db.refresh(model)

        return NotificationAggregate.from_persistence(
            id=model.id,
            user_id=model.user_id,
            event_type=model.event_type,
            data=model.data,
            read=model.read,
            created_at=model.created_at
        )

    def get_by_id(self, notification_id: UUID) -> Optional[NotificationAggregate]:
        """Retrieve notification by ID."""
        model = self.db.query(NotificationModel).filter_by(id=notification_id).first()
        if not model:
            return None

        return NotificationAggregate.from_persistence(
            id=model.id,
            user_id=model.user_id,
            event_type=model.event_type,
            data=model.data,
            read=model.read,
            created_at=model.created_at
        )

    def get_recent(self, user_id: UUID, limit: int = 7, unread_only: bool = False) -> List[NotificationAggregate]:
        """
        Get recent notifications for user.

        Args:
            user_id: User UUID
            limit: Maximum number of notifications to return
            unread_only: If True, only return unread notifications

        Returns:
            List of NotificationAggregates ordered by created_at DESC
        """
        query = self.db.query(NotificationModel).filter_by(user_id=user_id)

        if unread_only:
            query = query.filter_by(read=False)

        models = query.order_by(NotificationModel.created_at.desc()).limit(limit).all()

        return [
            NotificationAggregate.from_persistence(
                id=model.id,
                user_id=model.user_id,
                event_type=model.event_type,
                data=model.data,
                read=model.read,
                created_at=model.created_at
            )
            for model in models
        ]

    def count_unread(self, user_id: UUID) -> int:
        """
        Get count of unread notifications.

        Args:
            user_id: User UUID

        Returns:
            Count of unread notifications
        """
        return self.db.query(NotificationModel).filter_by(
            user_id=user_id,
            read=False
        ).count()

    def get_unread_by_user(self, user_id: UUID, limit: int = 50) -> List[NotificationAggregate]:
        """
        Get unread notifications for a user.

        Args:
            user_id: User UUID
            limit: Maximum number of notifications to return (default 50)

        Returns:
            List of unread NotificationAggregates ordered by created_at DESC
        """
        models = self.db.query(NotificationModel)\
            .filter_by(user_id=user_id, read=False)\
            .order_by(NotificationModel.created_at.desc())\
            .limit(limit)\
            .all()

        return [
            NotificationAggregate.from_persistence(
                id=model.id,
                user_id=model.user_id,
                event_type=model.event_type,
                data=model.data,
                read=model.read,
                created_at=model.created_at
            )
            for model in models
        ]

    def get_all_by_user(self, user_id: UUID, limit: int = 100) -> List[NotificationAggregate]:
        """
        Get all notifications for a user (read and unread).

        Args:
            user_id: User UUID
            limit: Maximum number of notifications to return (default 100)

        Returns:
            List of NotificationAggregates ordered by created_at DESC
        """
        models = self.db.query(NotificationModel)\
            .filter_by(user_id=user_id)\
            .order_by(NotificationModel.created_at.desc())\
            .limit(limit)\
            .all()

        return [
            NotificationAggregate.from_persistence(
                id=model.id,
                user_id=model.user_id,
                event_type=model.event_type,
                data=model.data,
                read=model.read,
                created_at=model.created_at
            )
            for model in models
        ]

    def mark_as_read(self, notification_id: UUID) -> bool:
        """
        Mark notification as read.

        Args:
            notification_id: Notification UUID

        Returns:
            True if updated, False if notification not found
        """
        model = self.db.query(NotificationModel).filter_by(id=notification_id).first()
        if not model:
            return False

        model.read = True
        self.db.commit()
        return True

    def mark_all_read(self, user_id: UUID) -> int:
        """
        Mark all notifications as read for a user.

        Args:
            user_id: User UUID

        Returns:
            Number of notifications marked as read
        """
        count = self.db.query(NotificationModel)\
            .filter_by(user_id=user_id, read=False)\
            .update({"read": True})
        self.db.commit()
        return count

    def mark_all_as_read(self, user_id: UUID) -> int:
        """
        Mark all notifications as read for a user (alias for mark_all_read).

        Args:
            user_id: User UUID

        Returns:
            Number of notifications marked as read
        """
        return self.mark_all_read(user_id)

    def delete_old_read_notifications(self, days: int = 30) -> int:
        """
        Delete read notifications older than specified days.

        Args:
            days: Number of days to keep read notifications (default 30)

        Returns:
            Number of notifications deleted
        """
        cutoff_date = datetime.utcnow() - timedelta(days=days)
        count = self.db.query(NotificationModel)\
            .filter(NotificationModel.read == True, NotificationModel.created_at < cutoff_date)\
            .delete()
        self.db.commit()
        return count
