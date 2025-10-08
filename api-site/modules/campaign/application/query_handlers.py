# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate, GameEntity
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.application.queries import (
    GetUserCampaigns,
    GetCampaignById,
    GetCampaignGames,
    GetGameById,
    CheckGameDMStatus
)


class GetUserCampaignsHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, requesting_user_id: UUID) -> List[CampaignAggregate]:
        """Policy: User can only view their own campaigns"""
        query = GetUserCampaigns(self.repository)
        return query.execute(requesting_user_id)


class GetCampaignByIdHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, campaign_id: UUID, requesting_user_id: UUID) -> Optional[CampaignAggregate]:
        """Policy: Only campaign owner or players can view campaign details"""
        query = GetCampaignById(self.repository)
        campaign = query.execute(campaign_id)

        if not campaign:
            return None

        # Authorization: Only owner or players can view
        if not campaign.is_owned_by(requesting_user_id) and requesting_user_id not in campaign.player_ids:
            raise ValueError("Access denied - only campaign members can view details")

        return campaign


class GetCampaignGamesHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, campaign_id: UUID, requesting_user_id: UUID) -> List[GameEntity]:
        """Policy: Only campaign owner or players can view games"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Authorization: Only owner or players can view games
        if not campaign.is_owned_by(requesting_user_id) and requesting_user_id not in campaign.player_ids:
            raise ValueError("Access denied - only campaign members can view games")

        query = GetCampaignGames(self.repository)
        return query.execute(campaign_id)


class GetGameByIdHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, game_id: UUID, requesting_user_id: UUID) -> Optional[GameEntity]:
        """Policy: Only campaign owner or players can view game"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            return None

        campaign = self.repository.get_by_id(game.campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        # Authorization: Only owner or players can view game
        if not campaign.is_owned_by(requesting_user_id) and requesting_user_id not in campaign.player_ids:
            raise ValueError("Access denied - only campaign members can view game")

        return game


class CheckGameDMStatusHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, game_id: UUID, requesting_user_id: UUID) -> dict:
        """Policy: Anyone can check DM status (used for UI decisions)"""
        query = CheckGameDMStatus(self.repository)
        return query.execute(game_id, requesting_user_id)
