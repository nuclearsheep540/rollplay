# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.game.domain.entities import GameEntity


class GetUserCampaigns:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is a member (DM or player)"""
        return self.repository.get_by_member_id(user_id)


class GetCampaignById:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID with all games"""
        return self.repository.get_by_id(campaign_id)


class GetCampaignGames:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID) -> List[GameEntity]:
        """Get all games in a campaign"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        return campaign.games


class GetGameById:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, game_id: UUID) -> Optional[GameEntity]:
        """Get game by ID"""
        return self.repository.get_game_by_id(game_id)


class CheckGameDMStatus:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, game_id: UUID, user_id: UUID) -> dict:
        """Check if user is DM of the game"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        is_dm = game.dm_id == user_id

        return {
            "is_dm": is_dm,
            "game_id": str(game_id),
            "campaign_id": str(game.campaign_id)
        }
