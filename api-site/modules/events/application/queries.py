# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import List, Optional

from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.domain.notification_aggregate import NotificationAggregate


class GetRecentNotifications:
    """
    Query to retrieve recent notifications for a user.

    Used by notification bell to display recent notifications.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID, limit: int = 7, unread_only: bool = False) -> List[NotificationAggregate]:
        """
        Get recent notifications for user.

        Args:
            user_id: User UUID
            limit: Maximum notifications to return (default 7)
            unread_only: If True, only return unread notifications

        Returns:
            List of NotificationAggregates ordered by created_at DESC
        """
        return self.repository.get_recent(user_id, limit=limit, unread_only=unread_only)


class GetUnreadCount:
    """
    Query to get count of unread notifications for a user.

    Used by notification bell badge.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID) -> int:
        """
        Get count of unread notifications.

        Args:
            user_id: User UUID

        Returns:
            Count of unread notifications
        """
        return self.repository.count_unread(user_id)


class GetUnreadNotifications:
    """
    Query to retrieve unread notifications for a user.

    Used by frontend to display notification count and list.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID, limit: int = 50) -> List[NotificationAggregate]:
        """
        Get unread notifications for user.

        Args:
            user_id: User UUID
            limit: Maximum notifications to return (default 50)

        Returns:
            List of unread NotificationAggregates
        """
        return self.repository.get_unread_by_user(user_id, limit)


class GetNotificationHistory:
    """
    Query to retrieve notification history for a user.

    Used by frontend notification center to show all notifications.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, user_id: UUID, limit: int = 100) -> List[NotificationAggregate]:
        """
        Get all notifications for user (read and unread).

        Args:
            user_id: User UUID
            limit: Maximum notifications to return (default 100)

        Returns:
            List of NotificationAggregates ordered by created_at DESC
        """
        return self.repository.get_all_by_user(user_id, limit)


class GetNotificationById:
    """
    Query to retrieve a specific notification by ID.

    Used for notification detail views.
    """

    def __init__(self, repository: NotificationRepository):
        self.repository = repository

    def execute(self, notification_id: UUID) -> Optional[NotificationAggregate]:
        """
        Get notification by ID.

        Args:
            notification_id: Notification UUID

        Returns:
            NotificationAggregate if found, None otherwise
        """
        return self.repository.get_by_id(notification_id)
