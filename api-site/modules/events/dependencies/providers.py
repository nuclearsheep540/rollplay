# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from fastapi import Depends

from shared.dependencies.db import get_db
from modules.events.repositories.notification_repository import NotificationRepository
from modules.events.websocket_manager import event_connection_manager
from modules.events.event_manager import EventManager


def get_notification_repository(db: Session = Depends(get_db)) -> NotificationRepository:
    """
    Dependency injection for NotificationRepository.

    Args:
        db: Database session (injected)

    Returns:
        NotificationRepository instance
    """
    return NotificationRepository(db)


def get_event_connection_manager():
    """
    Dependency injection for EventConnectionManager.

    Returns:
        Singleton EventConnectionManager instance
    """
    return event_connection_manager


def get_event_manager(
    notification_repo: NotificationRepository = Depends(get_notification_repository)
) -> EventManager:
    """
    Dependency injection for EventManager.

    Args:
        notification_repo: NotificationRepository (injected)

    Returns:
        EventManager instance
    """
    return EventManager(event_connection_manager, notification_repo)
