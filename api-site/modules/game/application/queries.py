# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from modules.game.repositories.game_repository import GameRepository
from modules.game.domain.game_aggregate import GameAggregate


class GetGameById:
    """Get a game by ID"""

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(self, game_id: UUID) -> Optional[GameAggregate]:
        """Get game by ID"""
        return self.game_repo.get_by_id(game_id)


class GetGamesByCampaign:
    """Get all games for a campaign"""

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(self, campaign_id: UUID) -> List[GameAggregate]:
        """Get all games for a campaign"""
        return self.game_repo.get_by_campaign_id(campaign_id)


class GetGamePlayers:
    """Get list of user IDs who have joined a game"""

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(self, game_id: UUID) -> List[UUID]:
        """Get user IDs for players who have joined the game roster"""
        game = self.game_repo.get_by_id(game_id)
        if not game:
            raise ValueError(f"Game {game_id} not found")

        return game.joined_users


class GetUserGames:
    """Get all games where user is host or joined"""

    def __init__(self, game_repository: GameRepository):
        self.game_repo = game_repository

    def execute(self, user_id: UUID) -> List[GameAggregate]:
        """
        Get all games where user is either:
        - The host (DM)
        - A joined player (in joined_users)
        """
        all_games = self.game_repo.get_all()
        user_games = []

        for game in all_games:
            # Include if user is host
            if game.host_id == user_id:
                user_games.append(game)
            # Include if user has joined
            elif game.is_user_joined(user_id):
                user_games.append(game)

        return user_games
