# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate


class GetUserCampaigns:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is a member (DM or player) OR has a pending invite"""
        # Get campaigns where user is a member
        member_campaigns = self.repository.get_by_member_id(user_id)

        # Get campaigns where user has pending invite
        invited_campaigns = self.repository.get_invited_campaigns(user_id)

        # Combine both lists (no duplicates since a user can't be both invited and member)
        all_campaigns = member_campaigns + invited_campaigns

        return all_campaigns


class GetCampaignById:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID"""
        return self.repository.get_by_id(campaign_id)


# Game-related queries moved to modules/game/application/queries.py
# - GetCampaignGames -> GetGamesByCampaign
# - GetGameById -> GetGameById (in game module)
# - CheckGameDMStatus -> Use game module instead
