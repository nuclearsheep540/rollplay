# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import Dict, Any

from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.domain.notification_aggregate import NotificationAggregate


class CreateNotification:
    """
    Command to create and persist a new notification.

    Used by EventManager when save_notification=True.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID, event_type: str, data: Dict[str, Any]) -> NotificationAggregate:
        """
        Create and save notification.

        Args:
            user_id: UUID of user to notify
            event_type: Type of event
            data: Event payload data

        Returns:
            NotificationAggregate: Created notification with ID
        """
        notification = NotificationAggregate.create(
            user_id=user_id,
            event_type=event_type,
            data=data
        )

        return self.repository.save(notification)


class MarkNotificationAsRead:
    """
    Command to mark a notification as read.

    Used when user views notification in notification center.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, notification_id: UUID, user_id: UUID) -> bool:
        """
        Mark notification as read.

        Args:
            notification_id: UUID of notification
            user_id: UUID of user (for security validation)

        Returns:
            True if marked as read, False if not found

        Raises:
            ValueError: If user doesn't own the notification
        """
        notification = self.repository.get_by_id(notification_id)
        if not notification:
            return False

        if notification.user_id != user_id:
            raise ValueError("Cannot mark another user's notification as read")

        notification.mark_as_read()
        self.repository.save(notification)
        return True


class MarkAllNotificationsAsRead:
    """
    Command to mark all notifications as read for a user.

    Used when user clicks "Mark all as read" button.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> int:
        """
        Mark all notifications as read for user.

        Args:
            user_id: User UUID

        Returns:
            Number of notifications marked as read
        """
        return self.repository.mark_all_as_read(user_id)


class DeleteOldNotifications:
    """
    Command to cleanup old read notifications.

    Should be run periodically (e.g., daily cron job).
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, days: int = 30) -> int:
        """
        Delete read notifications older than specified days.

        Args:
            days: Number of days to keep (default 30)

        Returns:
            Number of notifications deleted
        """
        return self.repository.delete_old_read_notifications(days)
