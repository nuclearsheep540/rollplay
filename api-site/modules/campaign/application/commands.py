# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID
import logging
import asyncio

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_events import CampaignEvents
from modules.events.event_manager import EventManager
from modules.user.orm.user_repository import UserRepository

logger = logging.getLogger(__name__)


class CreateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, host_id: UUID, title: str, description: str = "", hero_image: Optional[str] = None) -> CampaignAggregate:
        """Create a new campaign"""
        campaign = CampaignAggregate.create(
            title=title,
            description=description,
            host_id=host_id,
            hero_image=hero_image
        )

        self.repository.save(campaign)
        return campaign


class UpdateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(
        self,
        campaign_id: UUID,
        host_id: UUID,
        title: Optional[str] = None,
        description: Optional[str] = None,
        hero_image: Optional[str] = "UNSET"
    ) -> CampaignAggregate:
        """Update campaign details"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can update campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can update this campaign")

        campaign.update_details(title=title, description=description, hero_image=hero_image)
        self.repository.save(campaign)
        return campaign


class DeleteCampaign:
    def __init__(self, repository, game_repository=None):
        self.repository = repository
        self.game_repository = game_repository

    def execute(self, campaign_id: UUID, host_id: UUID) -> bool:
        """Delete campaign if business rules allow"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            return False

        # Business rule: Only host can delete campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can delete this campaign")

        # Business rule: Cannot delete campaign with ACTIVE games (would disrupt live sessions)
        if self.game_repository:
            from modules.game.domain.game_aggregate import GameStatus
            for game_id in campaign.game_ids:
                game = self.game_repository.get_by_id(game_id)
                if game and game.status == GameStatus.ACTIVE:
                    raise ValueError("Cannot delete campaign with active game sessions. Please end all active sessions first.")

        return self.repository.delete(campaign_id)


class AddPlayerToCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Invite a player to the campaign (host only) - sends pending invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can invite players
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can invite players to this campaign")

        # Business logic in aggregate - sends invite (goes to invited_player_ids)
        campaign.invite_player(player_id)

        # Save
        self.repository.save(campaign)

        # Get user details for notifications
        host = self.user_repo.get_by_id(host_id)
        player = self.user_repo.get_by_id(player_id)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One invite action fires TWO separate WebSocket events:
        #   1. campaign_invite_received → sent to the INVITED PLAYER
        #   2. campaign_invite_sent     → sent to the HOST as confirmation
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to invited player
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_received(
                    invited_player_id=player_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    host_id=host_id,
                    host_screen_name=host.screen_name if host else "Unknown"
                )
            )
        )

        # Broadcast 2/2: Confirmation to host
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_sent(
                    host_id=host_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    player_id=player_id,
                    player_screen_name=player.screen_name if player else "Unknown"
                )
            )
        )

        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Remove a player from the campaign (host only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can remove players
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can remove players from this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Business logic in aggregate
        campaign.remove_player(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One remove action fires TWO separate WebSocket events:
        #   1. campaign_player_removed              → sent to the PLAYER
        #   2. campaign_player_removed_confirmation → sent to the HOST
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to the removed player
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_player_removed(
                    removed_player_id=player_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    removed_by_id=host_id
                )
            )
        )

        # Broadcast 2/2: Confirmation to the host
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_player_removed_confirmation(
                    host_id=host_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    player_screen_name=player.screen_name if player else "Unknown"
                )
            )
        )

        return campaign


class AcceptCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager, game_repository=None):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager
        self.game_repository = game_repository

    def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """
        Player accepts their campaign invite.

        Also automatically adds player to any active games in the campaign.
        """
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - moves from invited_player_ids to player_ids
        campaign.accept_invite(player_id)

        # Save
        self.repository.save(campaign)

        # Add player to any active games in this campaign and track which ones
        auto_added_to_game_ids = []
        if self.game_repository:
            from modules.game.domain.game_aggregate import GameStatus
            # Get all games for this campaign
            for game_id in campaign.game_ids:
                game = self.game_repository.get_by_id(game_id)
                if game and game.status == GameStatus.ACTIVE:
                    # Add player to active game if not already joined
                    if player_id not in game.joined_users:
                        game.joined_users.append(player_id)
                        self.game_repository.save(game)
                        auto_added_to_game_ids.append(game_id)
                        logger.info(f"✅ Auto-added late-joining player {player_id} to active game {game_id}")

        # Broadcast notification event to host
        player = self.user_repo.get_by_id(player_id)
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_accepted(
                    host_id=campaign.host_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    player_id=player_id,
                    player_screen_name=player.screen_name if player else "Unknown",
                    auto_added_to_game_ids=auto_added_to_game_ids
                )
            )
        )

        return campaign


class DeclineCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player declines their campaign invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - removes from invited_player_ids
        campaign.decline_invite(player_id)

        # Save
        self.repository.save(campaign)

        # Broadcast state update to host (no toast, but updates their local state)
        player = self.user_repo.get_by_id(player_id)
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_declined(
                    host_id=campaign.host_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    player_id=player_id,
                    player_screen_name=player.screen_name if player else "Unknown"
                )
            )
        )

        return campaign


class CancelCampaignInvite:
    def __init__(self, repository, user_repo: UserRepository, event_manager: EventManager):
        self.repository = repository
        self.user_repo = user_repo
        self.event_manager = event_manager

    def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Host cancels a pending invite before it's accepted"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can cancel invites
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can cancel invites for this campaign")

        # Get player details for notification before removing
        player = self.user_repo.get_by_id(player_id)

        # Business logic in aggregate - removes from invited_player_ids
        campaign.cancel_invite(player_id)

        # Save
        self.repository.save(campaign)

        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
        # DUAL BROADCAST: One cancel action fires TWO separate WebSocket events:
        #   1. campaign_invite_canceled              → sent to the PLAYER
        #   2. campaign_invite_canceled_confirmation → sent to the HOST
        # ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

        # Broadcast 1/2: Notification to the player whose invite was canceled
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_canceled(
                    player_id=player_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title
                )
            )
        )

        # Broadcast 2/2: Confirmation to the host
        asyncio.create_task(
            self.event_manager.broadcast(
                **CampaignEvents.campaign_invite_canceled_confirmation(
                    host_id=host_id,
                    campaign_id=campaign_id,
                    campaign_name=campaign.title,
                    player_screen_name=player.screen_name if player else "Unknown"
                )
            )
        )

        return campaign

