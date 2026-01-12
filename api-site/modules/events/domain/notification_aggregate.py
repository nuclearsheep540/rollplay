# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional, Dict, Any
from uuid import UUID


def utc_now():
    return datetime.now(timezone.utc)


@dataclass
class NotificationAggregate:
    """
    Represents a persisted event notification.

    Notifications are created when events occur and need to be stored
    for offline delivery or notification history viewing.
    """
    id: Optional[UUID]
    user_id: UUID
    event_type: str
    data: Dict[str, Any]
    read: bool
    created_at: datetime

    @classmethod
    def create(cls, user_id: UUID, event_type: str, data: Dict[str, Any]) -> 'NotificationAggregate':
        """
        Create new notification with business rules validation.

        Args:
            user_id: UUID of the user this notification is for
            event_type: Type of event (e.g., 'friend_request_received')
            data: Event payload data

        Returns:
            NotificationAggregate: New notification aggregate

        Raises:
            ValueError: If validation fails
        """
        if not user_id:
            raise ValueError("user_id is required")

        if not event_type or not event_type.strip():
            raise ValueError("event_type cannot be empty")

        if len(event_type) > 100:
            raise ValueError("event_type cannot exceed 100 characters")

        if not isinstance(data, dict):
            raise ValueError("data must be a dictionary")

        return cls(
            id=None,
            user_id=user_id,
            event_type=event_type.strip(),
            data=data,
            read=False,
            created_at=utc_now()
        )

    def mark_as_read(self):
        """Mark this notification as read by the user."""
        self.read = True

    def mark_as_unread(self):
        """Mark this notification as unread."""
        self.read = False

    @classmethod
    def from_persistence(
        cls,
        id: UUID,
        user_id: UUID,
        event_type: str,
        data: Dict[str, Any],
        read: bool,
        created_at: datetime
    ) -> 'NotificationAggregate':
        """
        Reconstitute notification from database.

        Args:
            id: Notification UUID
            user_id: User UUID
            event_type: Event type string
            data: Event data dictionary
            read: Whether notification has been read
            created_at: Creation timestamp

        Returns:
            NotificationAggregate: Reconstituted aggregate
        """
        return cls(
            id=id,
            user_id=user_id,
            event_type=event_type,
            data=data,
            read=read,
            created_at=created_at
        )
