# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
from typing import Dict, Any, List

from modules.events.domain.event_config import EventConfig


class CampaignEvents:
    """
    Domain event configurations for campaign aggregate.

    Each static method returns event configuration dict with:
    - user_id: Who should receive this event
    - event_type: Type identifier for frontend routing
    - data: Event payload
    - show_toast: Whether frontend should display toast notification
    - save_notification: Whether to persist to notifications table
    """

    @staticmethod
    def campaign_invite_received(invited_player_id: UUID, campaign_id: UUID, campaign_name: str, host_id: UUID, host_screen_name: str) -> EventConfig:
        """
        Event: User receives a campaign invitation

        Args:
            invited_player_id: User being invited
            campaign_id: Campaign ID
            campaign_name: Campaign name
            host_id: DM/host user ID
            host_screen_name: DM/host display name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=invited_player_id,
            event_type="campaign_invite_received",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "host_id": str(host_id),
                "host_screen_name": host_screen_name
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def campaign_invite_sent(host_id: UUID, campaign_id: UUID, campaign_name: str, player_id: UUID, player_screen_name: str) -> EventConfig:
        """
        Event: Confirmation to host that invite was sent

        Args:
            host_id: Campaign host/DM who sent the invite
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_id: Player who was invited
            player_screen_name: Player's display name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_invite_sent",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_id": str(player_id),
                "player_screen_name": player_screen_name
            },
            show_toast=True,
            save_notification=False  # Don't persist - just confirmation
        )

    @staticmethod
    def campaign_invite_accepted(host_id: UUID, campaign_id: UUID, campaign_name: str, player_id: UUID, player_screen_name: str, auto_added_to_session_ids: List[UUID]) -> EventConfig:
        """
        Event: Player accepted campaign invite (notifies host/DM)

        Args:
            host_id: Campaign host/DM to notify
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_id: Player who accepted
            player_screen_name: Player's display name
            auto_added_to_session_ids: List of game IDs player was auto-added to

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_invite_accepted",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_id": str(player_id),
                "player_screen_name": player_screen_name,
                "auto_added_to_games": [str(gid) for gid in auto_added_to_session_ids]
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def campaign_invite_declined(host_id: UUID, campaign_id: UUID, campaign_name: str, player_id: UUID, player_screen_name: str) -> EventConfig:
        """
        Event: Player declined campaign invite (updates host's local state)

        Args:
            host_id: Campaign DM/host
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_id: Player who declined
            player_screen_name: Player's display name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_invite_declined",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_id": str(player_id),
                "player_screen_name": player_screen_name
            },
            show_toast=False,  # Silent state update, no toast notification
            save_notification=False  # Don't persist - just updates local state
        )

    @staticmethod
    def campaign_invite_canceled(player_id: UUID, campaign_id: UUID, campaign_name: str) -> EventConfig:
        """
        Event: Host canceled a pending invite (notifies the player)

        Args:
            player_id: Player whose invite was canceled
            campaign_id: Campaign ID
            campaign_name: Campaign name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=player_id,
            event_type="campaign_invite_canceled",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name
            },
            show_toast=True,
            save_notification=False  # Don't persist - just removes from their list
        )

    @staticmethod
    def campaign_invite_canceled_confirmation(host_id: UUID, campaign_id: UUID, campaign_name: str, player_screen_name: str) -> EventConfig:
        """
        Event: Confirmation to host that invite was canceled

        Args:
            host_id: Campaign host/DM who canceled the invite
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_screen_name: Player whose invite was canceled

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_invite_canceled_confirmation",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_screen_name": player_screen_name
            },
            show_toast=True,
            save_notification=False  # Don't persist - just confirmation
        )

    @staticmethod
    def campaign_player_removed(removed_player_id: UUID, campaign_id: UUID, campaign_name: str, removed_by_id: UUID) -> EventConfig:
        """
        Event: Player was removed from campaign (notifies the player)

        Args:
            removed_player_id: Player who was removed
            campaign_id: Campaign ID
            campaign_name: Campaign name
            removed_by_id: User who removed the player (usually DM)

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=removed_player_id,
            event_type="campaign_player_removed",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "removed_by_id": str(removed_by_id)
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def campaign_player_removed_confirmation(host_id: UUID, campaign_id: UUID, campaign_name: str, player_screen_name: str) -> EventConfig:
        """
        Event: Confirmation to host that player was removed

        Args:
            host_id: Campaign host/DM who removed the player
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_screen_name: Player who was removed

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_player_removed_confirmation",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_screen_name": player_screen_name
            },
            show_toast=True,
            save_notification=False  # Don't persist - just confirmation
        )

    @staticmethod
    def campaign_player_left(host_id: UUID, campaign_id: UUID, campaign_name: str, player_id: UUID, player_screen_name: str) -> EventConfig:
        """
        Event: Player voluntarily left the campaign (notifies host)

        Args:
            host_id: Campaign host/DM to notify
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_id: Player who left
            player_screen_name: Player's display name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=host_id,
            event_type="campaign_player_left",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name,
                "player_id": str(player_id),
                "player_screen_name": player_screen_name
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def campaign_player_left_confirmation(player_id: UUID, campaign_id: UUID, campaign_name: str) -> EventConfig:
        """
        Event: Confirmation to player that they successfully left the campaign

        Args:
            player_id: Player who left
            campaign_id: Campaign ID
            campaign_name: Campaign name

        Returns:
            Event configuration dict
        """
        return EventConfig(
            user_id=player_id,
            event_type="campaign_player_left_confirmation",
            data={
                "campaign_id": str(campaign_id),
                "campaign_name": campaign_name
            },
            show_toast=True,
            save_notification=True
        )

    @staticmethod
    def campaign_character_selected(
        campaign_member_ids: List[UUID],
        acting_user_id: UUID,
        campaign_id: UUID,
        campaign_name: str,
        player_screen_name: str,
        character_name: str
    ) -> List[EventConfig]:
        """
        Event: Player selected a character for the campaign (notifies all other members)

        Silent event — no toast, no persistent notification. Purely for live cache invalidation.

        Args:
            campaign_member_ids: All campaign member user IDs (players + host)
            acting_user_id: User who selected the character (excluded from broadcast)
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_screen_name: Display name of the player who selected
            character_name: Name of the selected character

        Returns:
            List of event configuration dicts (one per recipient)
        """
        events = []
        for member_id in campaign_member_ids:
            if member_id != acting_user_id:
                events.append(EventConfig(
                    user_id=member_id,
                    event_type="campaign_character_selected",
                    data={
                        "campaign_id": str(campaign_id),
                        "campaign_name": campaign_name,
                        "player_screen_name": player_screen_name,
                        "character_name": character_name
                    },
                    show_toast=False,
                    save_notification=False
                ))
        return events

    @staticmethod
    def campaign_character_released(
        campaign_member_ids: List[UUID],
        acting_user_id: UUID,
        campaign_id: UUID,
        campaign_name: str,
        player_screen_name: str,
        character_name: str
    ) -> List[EventConfig]:
        """
        Event: Player released their character from the campaign (notifies all other members)

        Silent event — no toast, no persistent notification. Purely for live cache invalidation.

        Args:
            campaign_member_ids: All campaign member user IDs (players + host)
            acting_user_id: User who released the character (excluded from broadcast)
            campaign_id: Campaign ID
            campaign_name: Campaign name
            player_screen_name: Display name of the player who released
            character_name: Name of the released character

        Returns:
            List of event configuration dicts (one per recipient)
        """
        events = []
        for member_id in campaign_member_ids:
            if member_id != acting_user_id:
                events.append(EventConfig(
                    user_id=member_id,
                    event_type="campaign_character_released",
                    data={
                        "campaign_id": str(campaign_id),
                        "campaign_name": campaign_name,
                        "player_screen_name": player_screen_name,
                        "character_name": character_name
                    },
                    show_toast=False,
                    save_notification=False
                ))
        return events
