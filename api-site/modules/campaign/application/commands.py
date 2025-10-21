# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate


class CreateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, dm_id: UUID, name: str, description: str = "") -> CampaignAggregate:
        """Create a new campaign"""
        campaign = CampaignAggregate.create(
            name=name,
            description=description,
            dm_id=dm_id
        )

        self.repository.save(campaign)
        return campaign


class UpdateCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(
        self,
        campaign_id: UUID,
        dm_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> CampaignAggregate:
        """Update campaign details"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can update campaign
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can update this campaign")

        campaign.update_details(name=name, description=description)
        self.repository.save(campaign)
        return campaign


class DeleteCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, dm_id: UUID) -> bool:
        """Delete campaign if business rules allow"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            return False

        # Business rule: Only DM can delete campaign
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can delete this campaign")

        # Business rule: Cannot delete campaign with active games
        if not campaign.can_be_deleted():
            raise ValueError("Cannot delete campaign with active games")

        return self.repository.delete(campaign_id)


class AddPlayerToCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, dm_id: UUID) -> CampaignAggregate:
        """Add a player to the campaign (DM only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can add players
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can add players to this campaign")

        # Business logic in aggregate
        campaign.add_player(player_id)

        # Save
        self.repository.save(campaign)
        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, dm_id: UUID) -> CampaignAggregate:
        """Remove a player from the campaign (DM only)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can remove players
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can remove players from this campaign")

        # Business logic in aggregate
        campaign.remove_player(player_id)

        # Save
        self.repository.save(campaign)
        return campaign

