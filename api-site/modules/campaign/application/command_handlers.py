# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate, GameEntity
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.application.commands import (
    CreateCampaign,
    UpdateCampaign,
    DeleteCampaign,
    CreateGame,
    StartGame,
    EndGame,
    DeleteGame,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign
)


class CreateCampaignHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, owner_id: UUID, name: str, description: str = "") -> CampaignAggregate:
        """Policy: Authenticated user becomes owner of the campaign"""
        command = CreateCampaign(self.repository)
        return command.execute(owner_id, name, description)


class UpdateCampaignHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(
        self,
        campaign_id: UUID,
        requesting_user_id: UUID,
        name: Optional[str] = None,
        description: Optional[str] = None
    ) -> CampaignAggregate:
        """Policy: Only campaign owner can update campaign"""
        command = UpdateCampaign(self.repository)
        return command.execute(campaign_id, requesting_user_id, name, description)


class DeleteCampaignHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, campaign_id: UUID, requesting_user_id: UUID) -> bool:
        """Policy: Only campaign owner can delete campaign"""
        command = DeleteCampaign(self.repository)
        return command.execute(campaign_id, requesting_user_id)


class CreateGameHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(
        self,
        campaign_id: UUID,
        requesting_user_id: UUID,
        name: str,
        max_players: int = 6
    ) -> GameEntity:
        """Policy: Only campaign owner can create games"""
        command = CreateGame(self.repository)
        return command.execute(campaign_id, requesting_user_id, name, max_players)


class StartGameHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, game_id: UUID, requesting_user_id: UUID, mongodb_session_id: str) -> GameEntity:
        """Policy: Only campaign owner can start game session"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        campaign = self.repository.get_by_id(game.campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        # Authorization: Only campaign owner can start game
        if not campaign.is_owned_by(requesting_user_id):
            raise ValueError("Only the campaign owner can start this game")

        command = StartGame(self.repository)
        return command.execute(game_id, mongodb_session_id)


class EndGameHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, game_id: UUID, requesting_user_id: UUID) -> GameEntity:
        """Policy: Only campaign owner can end game session"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        campaign = self.repository.get_by_id(game.campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        # Authorization: Only campaign owner can end game
        if not campaign.is_owned_by(requesting_user_id):
            raise ValueError("Only the campaign owner can end this game")

        command = EndGame(self.repository)
        return command.execute(game_id)


class DeleteGameHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, game_id: UUID, requesting_user_id: UUID) -> GameEntity:
        """Policy: Only campaign owner can delete games"""
        command = DeleteGame(self.repository)
        return command.execute(game_id, requesting_user_id)


class AddPlayerToCampaignHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, campaign_id: UUID, player_id: UUID, requesting_user_id: UUID) -> CampaignAggregate:
        """Policy: Only campaign owner can add players"""
        command = AddPlayerToCampaign(self.repository)
        return command.execute(campaign_id, player_id, requesting_user_id)


class RemovePlayerFromCampaignHandler:
    def __init__(self, repository: CampaignRepository):
        self.repository = repository

    def handle(self, campaign_id: UUID, player_id: UUID, requesting_user_id: UUID) -> CampaignAggregate:
        """Policy: Campaign owner can remove anyone, players can remove themselves"""
        command = RemovePlayerFromCampaign(self.repository)
        return command.execute(campaign_id, player_id, requesting_user_id)
