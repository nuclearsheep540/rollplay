# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Any, Dict, Optional
from uuid import UUID
from datetime import datetime
import logging

from modules.events.domain.event_config import EventConfig
from modules.events.websocket_manager import EventConnectionManager
from modules.events.repositories.notification_repository import NotificationRepository
from modules.user.repositories.user_repository import UserRepository
from modules.events.application.commands import CreateNotification

logger = logging.getLogger(__name__)


class EventManager:
    """
    Central event dispatcher for real-time state synchronization.

    Responsibilities:
    - Broadcast events to connected WebSocket clients
    - Optionally persist notifications to database
    - Optionally record the event on the recipient's pulse
    - Handle offline users gracefully
    """

    def __init__(
        self,
        websocket_manager: EventConnectionManager,
        notification_repository: NotificationRepository,
        user_repository: UserRepository
    ):
        self.websocket_manager = websocket_manager
        self.notification_repo = notification_repository
        self.user_repo = user_repository

    async def broadcast(self, event: EventConfig):
        """
        Broadcast event to user via WebSocket and optionally persist.

        Args:
            event: EventConfig domain object defining recipient, payload, and behavior
        """
        user_id_str = str(event.user_id)

        # Recorded BEFORE the send so the socket can carry the stored entry
        # itself — the client then holds exactly what a later refresh will
        # hydrate, rather than a second construction of it that could drift.
        pulse_entry = self._record_on_pulse(event) if event.show_pulse else None

        message = {
            "event_type": event.event_type,
            "data": event.data,
            "show_toast": event.show_toast,
            "show_pulse": event.show_pulse,
            "timestamp": datetime.utcnow().isoformat()
        }

        if pulse_entry:
            message["pulse_entry"] = pulse_entry

        if self.websocket_manager.is_user_connected(user_id_str):
            await self.websocket_manager.send_to_user(user_id_str, message)
            logger.info(f"Event '{event.event_type}' sent to user {user_id_str} via WebSocket")
        else:
            logger.debug(f"User {user_id_str} not connected, event '{event.event_type}' not sent via WebSocket")

        if event.save_notification:
            command = CreateNotification(self.notification_repo)
            notification = command.execute(event.user_id, event.event_type, event.data)
            logger.info(f"Notification '{event.event_type}' persisted for user {user_id_str} (id: {notification.id})")

    def _record_on_pulse(self, event: EventConfig) -> Optional[Dict[str, Any]]:
        """
        Write the event to the recipient's pulse.

        Recorded whether or not they are connected: the pulse is what happened
        near them recently, so someone who logs in ten minutes later should
        still see it. The entry's own six-hour expiry is what stops that
        becoming a claim about the distant past.

        Returns:
            The stored entry, or None if it could not be recorded. A failure is
            logged rather than raised: the broadcast that carried it is still
            worth delivering, and the client simply gets no pill.
        """
        try:
            user = self.user_repo.get_by_id(event.user_id)
            if not user:
                logger.warning(f"Pulse: no user {event.user_id} to record '{event.event_type}' for")
                return None

            entry = user.record_pulse_event(event.event_type, event.data)
            self.user_repo.save(user)
            return entry
        except Exception as e:
            logger.error(f"Pulse: failed to record '{event.event_type}' for {event.user_id}: {e}", exc_info=True)
            return None
