# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Dict, Any
from uuid import UUID
from datetime import datetime
import logging

from modules.events.websocket_manager import EventConnectionManager
from modules.events.repositories.notification_repository import NotificationRepository

logger = logging.getLogger(__name__)


class EventManager:
    """
    Central event dispatcher for real-time state synchronization.

    Responsibilities:
    - Broadcast events to connected WebSocket clients
    - Optionally persist notifications to database
    - Handle offline users gracefully
    """

    def __init__(
        self,
        websocket_manager: EventConnectionManager,
        notification_repository: NotificationRepository
    ):
        self.websocket_manager = websocket_manager
        self.notification_repo = notification_repository

    async def broadcast(
        self,
        user_id: UUID,
        event_type: str,
        data: Dict[str, Any],
        show_toast: bool,
        save_notification: bool
    ):
        """
        Broadcast event to user via WebSocket and optionally persist.

        Args:
            user_id: UUID of user to notify
            event_type: Type of event (e.g., 'friend_request_received')
            data: Event payload data
            show_toast: Whether frontend should show toast notification
            save_notification: Whether to persist notification to database
        """
        user_id_str = str(user_id)

        message = {
            "event_type": event_type,
            "data": data,
            "show_toast": show_toast,
            "timestamp": datetime.utcnow().isoformat()
        }

        if self.websocket_manager.is_user_connected(user_id_str):
            await self.websocket_manager.send_to_user(user_id_str, message)
            logger.info(f"Event '{event_type}' sent to user {user_id_str} via WebSocket")
        else:
            logger.debug(f"User {user_id_str} not connected, event '{event_type}' not sent via WebSocket")

        if save_notification:
            from modules.events.application.commands import CreateNotification
            command = CreateNotification(self.notification_repo)
            notification = command.execute(user_id, event_type, data)
            logger.info(f"Notification '{event_type}' persisted for user {user_id_str} (id: {notification.id})")


class EventManagerSingleton:
    """
    Singleton wrapper for EventManager to ensure single instance.

    This is necessary because EventManager needs to be shared across
    all HTTP requests but initialized once with dependencies.
    """
    _instance = None

    @classmethod
    def initialize(cls, websocket_manager: EventConnectionManager, notification_repository: NotificationRepository):
        """Initialize the singleton with dependencies"""
        if cls._instance is None:
            cls._instance = EventManager(websocket_manager, notification_repository)
        return cls._instance

    @classmethod
    def get_instance(cls) -> EventManager:
        """Get the singleton instance"""
        if cls._instance is None:
            raise RuntimeError("EventManager not initialized. Call initialize() first.")
        return cls._instance
