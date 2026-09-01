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
        non_dm_member_ids: List[UUID],
        session_id: UUID,
        session_name: str,
        campaign_id: UUID,
        campaign_name: str,
        host_id: UUID,
        host_screen_name: str
    ) -> List[EventConfig]:
        """
        Event: Campaign host created a new session (silent state update for members)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).
        Recipients: All campaign members except the DM, who created it

        Args:
            non_dm_member_ids: Campaign members other than the DM (who is the creator)
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

        for member_id in non_dm_member_ids:
            events.append(EventConfig(
                user_id=member_id,
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
    def session_started(campaign_member_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID, campaign_name: str, host_id: UUID, host_screen_name: str) -> List[EventConfig]:
        """
        Event: Host started a session (notifies every campaign member)

        The host gets the toast but NOT a saved notification: they performed the
        action, so a notification row telling them about it is noise.

        Args:
            campaign_member_ids: Every active campaign member, DM included
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID
            campaign_name: Campaign name
            host_id: Session host user ID
            host_screen_name: Host display name

        Returns:
            List[EventConfig] (one per campaign member)
        """
        events = []
        for member_id in campaign_member_ids:
            events.append(EventConfig(
                user_id=member_id,
                event_type="session_started",
                data={
                    "session_id": str(session_id),
                    "session_name": session_name,
                    "campaign_id": str(campaign_id),
                    "campaign_name": campaign_name,
                    "host_id": str(host_id),
                    "host_screen_name": host_screen_name
                },
                show_toast=True,
                save_notification=(member_id != host_id)
            ))
        return events

    @staticmethod
    def session_paused(campaign_member_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID, paused_by_id: UUID, paused_by_screen_name: str) -> List[EventConfig]:
        """
        Event: Session paused (silent state update to every campaign member)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).

        Args:
            campaign_member_ids: Every active campaign member, DM included —
                NOT only those who were in the session
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID
            paused_by_id: User who paused the session (usually DM)
            paused_by_screen_name: Display name of user who paused

        Returns:
            List[EventConfig] (one per campaign member)
        """
        events = []
        for member_id in campaign_member_ids:
            events.append(EventConfig(
                user_id=member_id,
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
    def session_finished(dm_id: UUID, non_dm_member_ids: List[UUID], session_id: UUID, session_name: str, campaign_id: UUID) -> List[EventConfig]:
        """
        Event: Session marked as finished/completed (silent state update to every campaign member)

        Pure state update - no toast notification, no persistent notification.
        Only triggers frontend state refresh (session list update).

        Args:
            dm_id: Campaign DM user ID
            non_dm_member_ids: Campaign members other than the DM
            session_id: Session ID
            session_name: Session name
            campaign_id: Campaign ID

        Returns:
            List[EventConfig] (DM + every other campaign member)
        """
        events = []
        all_recipients = [dm_id] + non_dm_member_ids

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
