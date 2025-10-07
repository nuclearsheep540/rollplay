# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from uuid import UUID

from campaign.domain.aggregates import CampaignAggregate
from campaign.game.domain.entities import GameEntity


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


class CreateGame:
    def __init__(self, repository):
        self.repository = repository

    def execute(
        self,
        campaign_id: UUID,
        dm_id: UUID,
        name: str,
        max_players: int = 6
    ) -> GameEntity:
        """Create a new game in campaign"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can create games in their campaign
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can create games in this campaign")

        # Use aggregate to create game (enforces business rules)
        game = campaign.add_game(name=name, max_players=max_players)

        # Save campaign with new game
        self.repository.save(campaign)
        return game


class StartGame:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, game_id: UUID, mongodb_session_id: str) -> GameEntity:
        """Start a game session (transition to hot storage)"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Business rule: Game must be startable
        if not game.can_be_started():
            raise ValueError(f"Game cannot be started in {game.status.value} state")

        # Start session through entity
        game.start_session(mongodb_session_id)

        # Save game
        self.repository.save_game(game)
        return game


class EndGame:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, game_id: UUID) -> GameEntity:
        """End a game session (transition back to cold storage)"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        # Business rule: Game must be endable
        if not game.can_be_ended():
            raise ValueError(f"Game cannot be ended in {game.status.value} state")

        # End session through entity
        game.end_session()

        # Save game
        self.repository.save_game(game)
        return game


class DeleteGame:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, game_id: UUID, dm_id: UUID) -> GameEntity:
        """Delete a game if business rules allow"""
        game = self.repository.get_game_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        campaign = self.repository.get_by_id(game.campaign_id)
        if not campaign:
            raise ValueError("Campaign not found")

        # Business rule: Only DM can delete games
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can delete games in this campaign")

        # Business rule: Can only delete inactive games
        if not game.can_be_deleted():
            raise ValueError("Can only delete INACTIVE games")

        # Remove game from campaign
        campaign.remove_game(game_id)

        # Save campaign
        self.repository.save(campaign)
        return game


class AddPlayerToCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, dm_id: UUID) -> CampaignAggregate:
        """Add a player to campaign (DM only operation)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: Only DM can add players
        if not campaign.is_owned_by(dm_id):
            raise ValueError("Only the DM can add players to this campaign")

        # Use aggregate to add player (enforces business rules)
        campaign.add_player(player_id)

        # Save campaign
        self.repository.save(campaign)
        return campaign


class RemovePlayerFromCampaign:
    def __init__(self, repository):
        self.repository = repository

    def execute(self, campaign_id: UUID, player_id: UUID, requesting_user_id: UUID) -> CampaignAggregate:
        """Remove a player from campaign (DM or self-removal)"""
        campaign = self.repository.get_by_id(campaign_id)
        if not campaign:
            raise ValueError(f"Campaign {campaign_id} not found")

        # Business rule: DM can remove anyone, players can only remove themselves
        if not campaign.is_owned_by(requesting_user_id) and requesting_user_id != player_id:
            raise ValueError("Players can only remove themselves from campaigns")

        # Use aggregate to remove player
        campaign.remove_player(player_id)

        # Save campaign
        self.repository.save(campaign)
        return campaign
