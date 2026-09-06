# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Events - Domain Events for Session Lifecycle

Ubiquitous Language:
- Session = The scheduled/planned play instance (managed by api-site)
- Game = The live multiplayer experience (managed by api-game)

These events notify users about session lifecycle changes.
"""

from datetime import datetime
from uuid import UUID
from typing import List, Optional
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
    def session_started(campaign_member_ids: List[UUID], session_id: UUID, campaign_id: UUID, campaign_name: str, host_id: UUID, host_screen_name: str) -> List[EventConfig]:
        """
        Event: Host started a session (notifies every campaign member)

        The host gets the toast but NOT a saved notification: they performed the
        action, so a notification row telling them about it is noise.

        Args:
            campaign_member_ids: Every active campaign member, DM included
            session_id: Session ID
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
    def session_paused(campaign_member_ids: List[UUID], session_id: UUID, campaign_id: UUID, paused_by_id: UUID, paused_by_screen_name: str) -> List[EventConfig]:
        """
        Event: the SYSTEM took a game down (expiry sweeper or admin CLI).

        Deliberately silent — no toast, no notification row. From a user's side
        nothing happened: the game simply reads as not running, exactly as it
        would after the host ended it. Only triggers a frontend state refresh.
        The host's own End game is session_ended, which does speak.

        Args:
            campaign_member_ids: Every active campaign member, DM included —
                NOT only those who were in the session
            session_id: Session ID
            campaign_id: Campaign ID
            paused_by_id: User the pause acted as (the session host)
            paused_by_screen_name: Display name of that user

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
                    "campaign_id": str(campaign_id),
                    "paused_by_id": str(paused_by_id),
                    "paused_by_screen_name": paused_by_screen_name
                },
                show_toast=False,         # No toast notification (silent state update)
                save_notification=False   # No persistent notification (state only)
            ))
        return events

    @staticmethod
    def session_scheduled(
        campaign_member_ids: List[UUID],
        session_id: UUID,
        campaign_id: UUID,
        campaign_name: str,
        host_id: UUID,
        host_screen_name: str,
        scheduled_at: Optional[datetime]
    ) -> List[EventConfig]:
        """
        Event: the host set, changed or cleared when the next game is.

        Toasted AND persisted, to every member except the host. Persisted because
        this is the one lifecycle event a player wants to find again later —
        "when did he say we were playing?" — unlike a game starting or ending,
        which only matter in the moment.

        A cleared schedule fires the same event with scheduled_at=None: a
        cancelled game is worth hearing about too.

        Args:
            campaign_member_ids: Every active campaign member, host included —
                the host is filtered out here, not by the caller
            session_id: Session ID
            campaign_id: Campaign ID
            campaign_name: Campaign name
            host_id: The host who set it
            host_screen_name: Host display name
            scheduled_at: The declared time, or None when cleared. Serialised to
                ISO-8601 here (EventConfig.data must be JSON-safe) and rendered
                in each viewer's own timezone client-side.

        Returns:
            List[EventConfig] (one per campaign member other than the host)
        """
        events = []
        for member_id in campaign_member_ids:
            if member_id == host_id:
                continue
            events.append(EventConfig(
                user_id=member_id,
                event_type="session_scheduled",
                data={
                    "session_id": str(session_id),
                    "campaign_id": str(campaign_id),
                    "campaign_name": campaign_name,
                    "host_id": str(host_id),
                    "host_screen_name": host_screen_name,
                    "scheduled_at": scheduled_at.isoformat() if scheduled_at else None
                },
                show_toast=True,
                save_notification=True
            ))
        return events

    @staticmethod
    def session_ended(
        campaign_member_ids: List[UUID],
        session_id: UUID,
        campaign_id: UUID,
        campaign_name: str,
        host_id: UUID,
        host_screen_name: str
    ) -> List[EventConfig]:
        """
        Event: the host ended the game (End game).

        Toasts every campaign member EXCEPT the host: they pressed the button and
        watched it happen, so telling them is noise. Not persisted — a game ending
        is momentary news, not something worth finding in the feed a week later
        (contrast session_started, which is worth catching up on).

        Args:
            campaign_member_ids: Every active campaign member, host included —
                the host is filtered out here, not by the caller
            session_id: Session ID
            campaign_id: Campaign ID
            campaign_name: Campaign name
            host_id: The host who ended the game
            host_screen_name: Host display name

        Returns:
            List[EventConfig] (one per campaign member other than the host)
        """
        events = []
        for member_id in campaign_member_ids:
            if member_id == host_id:
                continue
            events.append(EventConfig(
                user_id=member_id,
                event_type="session_ended",
                data={
                    "session_id": str(session_id),
                    "campaign_id": str(campaign_id),
                    "campaign_name": campaign_name,
                    "host_id": str(host_id),
                    "host_screen_name": host_screen_name
                },
                show_toast=True,
                save_notification=False
            ))
        return events
