# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.game import Game
from typing import List, Optional
from uuid import UUID
from datetime import datetime

class GameService:
    """Service for game data operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_games_by_user_id(self, user_id: UUID) -> List[Game]:
        """Get games where user is DM or player"""
        # Games where user is DM
        dm_games = self.db.query(Game).filter(Game.dm_id == user_id).all()
        
        # Games where user is player (JSON array contains user_id)
        # Note: This is a simplified approach - in production you'd want proper indexing
        player_games = self.db.query(Game).filter(
            Game.player_ids.op('?')(str(user_id))
        ).all()
        
        # Combine and deduplicate
        all_games = dm_games + player_games
        unique_games = list({game.id: game for game in all_games}.values())
        return unique_games
    
    def create_game(self, campaign_id: UUID, dm_id: UUID, session_name: str, 
                   max_players: int = 8, seat_colors: dict = None) -> Game:
        """Create new game session"""
        game = Game(
            campaign_id=campaign_id,
            dm_id=dm_id,
            session_name=session_name,
            max_players=max_players,
            seat_colors=seat_colors or {},
            player_ids=[],
            moderator_ids=[]
        )
        self.db.add(game)
        self.db.commit()
        self.db.refresh(game)
        return game
    
    def get_game_by_id(self, game_id: UUID) -> Optional[Game]:
        """Get game by ID"""
        return self.db.query(Game).filter(Game.id == game_id).first()
    
    def start_game(self, game_id: UUID) -> Game:
        """Start game session (activate)"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")
        
        game.status = "active"
        game.session_started_at = datetime.utcnow()
        game.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(game)
        
        # Create MongoDB active_session via api-game service
        import requests
        import json
        
        try:
            # Prepare active session data for api-game
            active_session_data = {
                "max_players": game.max_players,
                "seat_layout": ["empty"] * game.max_players,
                "created_at": game.created_at.isoformat(),
                "room_host": game.dm.screen_name if game.dm.screen_name else game.dm.email.split('@')[0],
                "seat_colors": game.seat_colors,
                "moderators": [],
                "dungeon_master": game.dm.screen_name if game.dm.screen_name else game.dm.email.split('@')[0]
            }
            
            # Call api-game to create the active session with specific ID
            response = requests.post(
                f"http://api-game:8081/game/{game.id}",
                json=active_session_data,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                # The response should contain the MongoDB _id
                game_response = response.json()
                created_id = game_response.get("id")
                
                # Verify the created game ID matches our PostgreSQL game ID
                if created_id != str(game.id):
                    import logging
                    logger = logging.getLogger(__name__)
                    logger.warning(f"MongoDB game ID {created_id} doesn't match PostgreSQL game ID {game.id}")
                    
            else:
                import logging
                logger = logging.getLogger(__name__)
                logger.error(f"Failed to create active_session via api-game: {response.status_code} - {response.text}")
                
        except Exception as e:
            # Log error but don't fail the game start
            import logging
            logger = logging.getLogger(__name__)
            logger.error(f"Failed to create active_session via api-game for game {game_id}: {e}")
        
        return game
    
    def end_game(self, game_id: UUID) -> Game:
        """End game session (archive and cleanup)"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")
        
        game.status = "completed"
        game.last_activity_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(game)
        
        # TODO: Archive MongoDB data to PostgreSQL
        # TODO: Cleanup WebSocket connections
        
        return game
    
    def add_player_to_game(self, game_id: UUID, user_id: UUID) -> Game:
        """Add player to game"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")
        
        if str(user_id) not in [str(uid) for uid in game.player_ids]:
            game.player_ids = game.player_ids + [str(user_id)]
            self.db.commit()
            self.db.refresh(game)
        
        return game
    
    def remove_player_from_game(self, game_id: UUID, user_id: UUID) -> Game:
        """Remove player from game"""
        game = self.db.query(Game).filter(Game.id == game_id).first()
        if not game:
            raise ValueError("Game not found")
        
        game.player_ids = [uid for uid in game.player_ids if str(uid) != str(user_id)]
        self.db.commit()
        self.db.refresh(game)
        
        return game