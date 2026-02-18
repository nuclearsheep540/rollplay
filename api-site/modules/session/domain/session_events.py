# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Events - Domain Events for Session Lifecycle

Ubiquitous Language:
- Session = The scheduled/planned play instance (managed by api-site)
- Game = The live multiplayer experience (managed by api-game)

These events notify users about session lifecycle changes.
"""

from uuid import UUID
from typing import List
from modules.events.domain.event_config import EventConfig


class SessionEvents:
    """
    Domain event configurations for session entity (within campaign aggregate).

    Each static method returns EventConfig (or List[EventConfig]) with:
    - user_id: Who should receive this event
    - event_type: Type identifier for frontend routing
    - data: Event payload
    - show_toast: Whether frontend should display toast notification
    - save_notification: Whether to persist to notifications table
    """

    @staticmethod
    def session_created(
        campaign_player_ids: List[UUID],
        session_id: UUID,
        session_name: str,
        campaign_id: UUID,
        campaign_name: str,
        host_id: UUID,
        host_screen_name: str
    ) -> List[EventConfig]:
        """
        Event: Campaign host created a new session (silent state update for players)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).
        Recipients: All campaign members (player_ids, excludes host)

        Args:
            campaign_player_ids: List of campaign member user IDs
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID
            campaign_name: Campaign name
            host_id: Host user ID
            host_screen_name: Host display name

        Returns:
            List[EventConfig] (one per campaign member)
        """
        events = []

        for player_id in campaign_player_ids:
            events.append(EventConfig(
                user_id=player_id,
                event_type="session_created",
                data={
                    "session_id": str(session_id),
                    "session_name": session_name,
                    "campaign_id": str(campaign_id),
                    "campaign_name": campaign_name,
                    "host_id": str(host_id),
                    "host_screen_name": host_screen_name
                },
                show_toast=False,         # No toast notification
                save_notification=False   # No persistent notification (state only)
            ))

        return events

    @staticmethod
    def session_started(campaign_player_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID, campaign_name: str, active_game_id: str, host_id: UUID, host_screen_name: str) -> List[EventConfig]:
        """
        Event: Host started a session (notifies all campaign players)

        Args:
            campaign_player_ids: List of all campaign member user IDs
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID
            campaign_name: Campaign name
            active_game_id: Active game ID in MongoDB
            host_id: Session host user ID
            host_screen_name: Host display name

        Returns:
            List[EventConfig] (one per player)
        """
        events = []
        for player_id in campaign_player_ids:
            events.append(EventConfig(
                user_id=player_id,
                event_type="session_started",
                data={
                    "session_id": str(session_id),
                    "session_name": session_name,
                    "campaign_id": str(campaign_id),
                    "campaign_name": campaign_name,
                    "active_game_id": active_game_id,
                    "host_id": str(host_id),
                    "host_screen_name": host_screen_name
                },
                show_toast=True,
                save_notification=True
            ))
        return events

    @staticmethod
    def session_paused(active_participant_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID, paused_by_id: UUID, paused_by_screen_name: str) -> List[EventConfig]:
        """
        Event: Session paused (silent state update to active participants)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).

        Args:
            active_participant_ids: List of user IDs who were in the session
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID
            paused_by_id: User who paused the session (usually DM)
            paused_by_screen_name: Display name of user who paused

        Returns:
            List[EventConfig] (one per participant)
        """
        events = []
        for participant_id in active_participant_ids:
            events.append(EventConfig(
                user_id=participant_id,
                event_type="session_paused",
                data={
                    "session_id": str(session_id),
                    "session_name": session_name,
                    "campaign_id": str(campaign_id),
                    "paused_by_id": str(paused_by_id),
                    "paused_by_screen_name": paused_by_screen_name
                },
                show_toast=False,         # No toast notification (silent state update)
                save_notification=False   # No persistent notification (state only)
            ))
        return events

    @staticmethod
    def session_finished(dm_id: UUID, participant_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID) -> List[EventConfig]:
        """
        Event: Session marked as finished/completed (silent state update to DM and participants)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).

        Args:
            dm_id: Campaign DM user ID
            participant_ids: List of player user IDs
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID

        Returns:
            List[EventConfig] (DM + all participants)
        """
        events = []
        all_recipients = [dm_id] + participant_ids

        for recipient_id in all_recipients:
            events.append(EventConfig(
                user_id=recipient_id,
                event_type="session_finished",
                data={
                    "session_id": str(session_id),
                    "session_name": session_name,
                    "campaign_id": str(campaign_id)
                },
                show_toast=False,         # No toast notification (silent state update)
                save_notification=False   # No persistent notification (state only)
            ))
        return events
