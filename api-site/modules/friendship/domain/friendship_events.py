# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import Any, Dict, List

from modules.events.domain.event_config import EventConfig


class FriendshipEvents:
    """
    Domain event configurations for friendship aggregate.

    Each static method returns event configuration dict with:
    - user_id: Who should receive this event
    - event_type: Type identifier for frontend routing
    - data: Event payload
    - show_toast: Whether frontend should display toast notification
    - save_notification: Whether to persist to notifications table
    """

    @staticmethod
    def friend_request_received(recipient_id: UUID, requester_id: UUID, requester_screen_name: str, request_id: UUID) -> EventConfig:
        """
        Event: User receives a new friend request

        Args:
            recipient_id: User receiving the request
            requester_id: User who sent the request
            requester_screen_name: Display name of requester
            request_id: Friend request ID

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=recipient_id,
            event_type="friend_request_received",
            data={
                "request_id": str(request_id),
                "requester_id": str(requester_id),
                "requester_screen_name": requester_screen_name
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def friend_request_accepted(requester_id: UUID, friend_id: UUID, friend_screen_name: str, friendship_id: UUID) -> EventConfig:
        """
        Event: User's friend request was accepted

        Args:
            requester_id: User who originally sent the request
            friend_id: User who accepted the request
            friend_screen_name: Display name of friend
            friendship_id: Friendship relationship ID

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=requester_id,
            event_type="friend_request_accepted",
            data={
                "friend_id": str(friend_id),
                "friend_screen_name": friend_screen_name,
                "friendship_id": str(friendship_id)
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def friend_online(friend_ids: List[UUID], user_id: UUID, screen_name: str) -> List[EventConfig]:
        """
        Event: A user came online (their first live events-socket connection).

        Sent only to that user's accepted friends — presence is never public.

        Args:
            friend_ids: Accepted friends of the user who came online
            user_id: The user who came online
            screen_name: Their display name

        Returns:
            List[EventConfig] (one per friend)
        """
        events = []
        for friend_id in friend_ids:
            events.append(EventConfig(
                user_id=friend_id,
                event_type="friend_online",
                data={
                    "user_id": str(user_id),
                    "screen_name": screen_name
                },
                show_toast=True,
                save_notification=False  # Presence is a now-state, never a notification row
            ))
        return events

    @staticmethod
    def friend_offline(friend_ids: List[UUID], user_id: UUID, screen_name: str) -> List[EventConfig]:
        """
        Event: A user went offline (their last events-socket connection closed).

        Silent by design — a friend leaving repaints presence, it does not interrupt.

        Args:
            friend_ids: Accepted friends of the user who went offline
            user_id: The user who went offline
            screen_name: Their display name

        Returns:
            List[EventConfig] (one per friend)
        """
        events = []
        for friend_id in friend_ids:
            events.append(EventConfig(
                user_id=friend_id,
                event_type="friend_offline",
                data={
                    "user_id": str(user_id),
                    "screen_name": screen_name
                },
                show_toast=False,
                save_notification=False
            ))
        return events

    @staticmethod
    def friend_buzzed(recipient_id: UUID, buzzer_id: UUID, buzzer_screen_name: str) -> EventConfig:
        """
        Event: User receives a buzz from a friend

        Args:
            recipient_id: User receiving the buzz
            buzzer_id: User who sent the buzz
            buzzer_screen_name: Display name of buzzer

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=recipient_id,
            event_type="friend_buzzed",
            data={
                "buzzer_id": str(buzzer_id),
                "buzzer_screen_name": buzzer_screen_name
            },
            show_toast=True,
            save_notification=False  # Don't persist buzz notifications
        )

    @staticmethod
    def buzz_sent(sender_id: UUID, recipient_id: UUID, recipient_screen_name: str) -> EventConfig:
        """
        Event: Confirmation to sender that their buzz was sent

        Args:
            sender_id: User who sent the buzz
            recipient_id: User who received the buzz
            recipient_screen_name: Display name of recipient

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=sender_id,
            event_type="buzz_sent",
            data={
                "recipient_id": str(recipient_id),
                "recipient_screen_name": recipient_screen_name
            },
            show_toast=True,
            save_notification=False  # Don't persist buzz notifications
        )
