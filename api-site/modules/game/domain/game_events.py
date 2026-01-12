# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import Dict, Any, List


class GameEvents:
    """
    Domain event configurations for game entity (within campaign aggregate).

    Each static method returns event configuration dict with:
    - user_id: Who should receive this event (or list for broadcast)
    - event_type: Type identifier for frontend routing
    - data: Event payload
    - show_toast: Whether frontend should display toast notification
    - save_notification: Whether to persist to notifications table
    """

    @staticmethod
    def game_started(campaign_player_ids: List[UUID], game_id: UUID, game_name: str, campaign_id: UUID, session_id: str, dm_id: UUID, dm_screen_name: str) -> List[Dict[str, Any]]:
        """
        Event: DM started a game session (notifies all campaign players)

        Args:
            campaign_player_ids: List of all campaign member user IDs
            game_id: Game ID
            game_name: Game name
            campaign_id: Campaign ID
            session_id: Active session ID (MongoDB)
            dm_id: DM user ID
            dm_screen_name: DM display name

        Returns:
            List of event configuration dicts (one per player)
        """
        events = []
        for player_id in campaign_player_ids:
            events.append({
                "user_id": player_id,
                "event_type": "game_started",
                "data": {
                    "game_id": str(game_id),
                    "game_name": game_name,
                    "campaign_id": str(campaign_id),
                    "session_id": session_id,
                    "dm_id": str(dm_id),
                    "dm_screen_name": dm_screen_name
                },
                "show_toast": True,
                "save_notification": True
            })
        return events

    @staticmethod
    def game_ended(active_participant_ids: List[UUID], game_id: UUID, game_name: str, ended_by_id: UUID, ended_by_screen_name: str) -> List[Dict[str, Any]]:
        """
        Event: Game session ended (notifies active participants)

        Args:
            active_participant_ids: List of user IDs who were in the session
            game_id: Game ID
            game_name: Game name
            ended_by_id: User who ended the game (usually DM)
            ended_by_screen_name: Display name of user who ended

        Returns:
            List of event configuration dicts (one per participant)
        """
        events = []
        for participant_id in active_participant_ids:
            events.append({
                "user_id": participant_id,
                "event_type": "game_ended",
                "data": {
                    "game_id": str(game_id),
                    "game_name": game_name,
                    "ended_by_id": str(ended_by_id),
                    "ended_by_screen_name": ended_by_screen_name
                },
                "show_toast": True,
                "save_notification": True  # Persist for session history
            })
        return events

    @staticmethod
    def game_finished(dm_id: UUID, participant_ids: List[UUID], game_id: UUID, game_name: str, campaign_id: UUID) -> List[Dict[str, Any]]:
        """
        Event: Game marked as finished/completed (notifies DM and participants)

        Args:
            dm_id: Campaign DM user ID
            participant_ids: List of player user IDs
            game_id: Game ID
            game_name: Game name
            campaign_id: Campaign ID

        Returns:
            List of event configuration dicts (DM + all participants)
        """
        events = []
        all_recipients = [dm_id] + participant_ids

        for recipient_id in all_recipients:
            events.append({
                "user_id": recipient_id,
                "event_type": "game_finished",
                "data": {
                    "game_id": str(game_id),
                    "game_name": game_name,
                    "campaign_id": str(campaign_id)
                },
                "show_toast": True,  # Show toast for campaign milestone
                "save_notification": True  # Persist for campaign history
            })
        return events
