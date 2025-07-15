# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.game_service import GameService
from models.game import Game
from typing import List
from uuid import UUID

class GetUserGames:
    """Command to get all games for a user"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, user_id: UUID) -> List[Game]:
        """Execute the command to get user's games"""
        games = self.game_service.get_games_by_user_id(user_id)
        return games

class CreateGame:
    """Command to create a new game"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, campaign_id: UUID, dm_id: UUID, session_name: str, **config) -> Game:
        """Execute the command to create a game"""
        game = self.game_service.create_game(
            campaign_id=campaign_id,
            dm_id=dm_id,
            session_name=session_name,
            max_players=config.get('max_players', 8),
            seat_colors=config.get('seat_colors', {})
        )
        return game

class StartGame:
    """Command to start a game session"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, game_id: UUID) -> Game:
        """Execute the command to start a game"""
        game = self.game_service.start_game(game_id)
        return game

class EndGame:
    """Command to end a game session"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, game_id: UUID) -> Game:
        """Execute the command to end a game"""
        game = self.game_service.end_game(game_id)
        return game

class AddPlayerToGame:
    """Command to add a player to a game"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, game_id: UUID, user_id: UUID) -> Game:
        """Execute the command to add player to game"""
        game = self.game_service.add_player_to_game(game_id, user_id)
        return game

class RemovePlayerFromGame:
    """Command to remove a player from a game"""
    
    def __init__(self, db: Session):
        self.game_service = GameService(db)
    
    def execute(self, game_id: UUID, user_id: UUID) -> Game:
        """Execute the command to remove player from game"""
        game = self.game_service.remove_player_from_game(game_id, user_id)
        return game