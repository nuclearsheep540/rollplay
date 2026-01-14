# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import Dict, Any


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
    def friend_request_received(recipient_id: UUID, requester_id: UUID, requester_screen_name: str, request_id: UUID) -> Dict[str, Any]:
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
        return {
            "user_id": recipient_id,
            "event_type": "friend_request_received",
            "data": {
                "request_id": str(request_id),
                "requester_id": str(requester_id),
                "requester_screen_name": requester_screen_name
            },
            "show_toast": True,
            "save_notification": True
        }

    @staticmethod
    def friend_request_accepted(requester_id: UUID, friend_id: UUID, friend_screen_name: str, friendship_id: UUID) -> Dict[str, Any]:
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
        return {
            "user_id": requester_id,
            "event_type": "friend_request_accepted",
            "data": {
                "friend_id": str(friend_id),
                "friend_screen_name": friend_screen_name,
                "friendship_id": str(friendship_id)
            },
            "show_toast": True,
            "save_notification": True
        }

    @staticmethod
    def friend_buzzed(recipient_id: UUID, buzzer_id: UUID, buzzer_screen_name: str) -> Dict[str, Any]:
        """
        Event: User receives a buzz from a friend

        Args:
            recipient_id: User receiving the buzz
            buzzer_id: User who sent the buzz
            buzzer_screen_name: Display name of buzzer

        Returns:
            Event configuration dict
        """
        return {
            "user_id": recipient_id,
            "event_type": "friend_buzzed",
            "data": {
                "buzzer_id": str(buzzer_id),
                "buzzer_screen_name": buzzer_screen_name
            },
            "show_toast": True,
            "save_notification": False  # Don't persist buzz notifications
        }
