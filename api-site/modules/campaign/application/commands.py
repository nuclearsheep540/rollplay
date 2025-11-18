# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate


class CreateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, host_id: UUID, title: str, description: str = "") -> CampaignAggregate:
        """Create a new campaign"""
        campaign = CampaignAggregate.create(
            title=title,
            description=description,
            host_id=host_id
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
        description: Optional[str] = None
    ) -> CampaignAggregate:
        """Update campaign details"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can update campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can update this campaign")

        campaign.update_details(title=title, description=description)
        self.repository.save(campaign)
        return campaign


class DeleteCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, host_id: UUID) -> bool:
        """Delete campaign if business rules allow"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            return False

        # Business rule: Only host can delete campaign
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can delete this campaign")

        # Business rule: Cannot delete campaign with active games
        if not campaign.can_be_deleted():
            raise ValueError("Cannot delete campaign with active games")

        return self.repository.delete(campaign_id)


class AddPlayerToCampaign:
    def __init__(self, repository):
        self.repository = repository

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
        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, host_id: UUID) -> CampaignAggregate:
        """Remove a player from the campaign (host only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only host can remove players
        if not campaign.is_owned_by(host_id):
            raise ValueError("Only the host can remove players from this campaign")

        # Business logic in aggregate
        campaign.remove_player(player_id)

        # Save
        self.repository.save(campaign)
        return campaign


class AcceptCampaignInvite:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player accepts their campaign invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - moves from invited_player_ids to player_ids
        campaign.accept_invite(player_id)

        # Save
        self.repository.save(campaign)
        return campaign


class DeclineCampaignInvite:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID) -> CampaignAggregate:
        """Player declines their campaign invite"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business logic in aggregate - removes from invited_player_ids
        campaign.decline_invite(player_id)

        # Save
        self.repository.save(campaign)
        return campaign

