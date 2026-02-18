# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from typing import Dict, Any
from uuid import UUID


@dataclass
class EventConfig:
    """
    Domain contract for a broadcastable event.

    All domain event factory methods (*Events classes) must return EventConfig
    instances. This ensures a consistent, validated shape for all events flowing
    through EventManager.broadcast().

    Fields:
        user_id: Recipient of this event
        event_type: Type identifier for frontend routing (e.g., 'campaign_invite_received')
        data: Event payload (all values should be strings for JSON serialization)
        show_toast: Whether the frontend should display a toast notification
        save_notification: Whether to persist to the notifications table
    """
    user_id: UUID
    event_type: str
    data: Dict[str, Any]
    show_toast: bool
    save_notification: bool

    def __post_init__(self):
        if not self.event_type or not self.event_type.strip():
            raise ValueError("event_type cannot be empty")

        if not isinstance(self.data, dict):
            raise ValueError("data must be a dictionary")

        if not isinstance(self.user_id, UUID):
            raise ValueError("user_id must be a UUID")
