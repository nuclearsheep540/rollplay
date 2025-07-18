# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete
from datetime import datetime, timedelta

from models.game import Game as GameModel
from models.campaign import Campaign as CampaignModel
from enums.game_status import GameStatus
from domain.game_domain import Game, Player, TurnEntry


class GameRepository:
    """Repository for Game entities with lifecycle management."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def to_domain(self, model: GameModel) -> Game:
        """Convert database model to domain object."""
        return Game(
            id=model.id,
            campaign_id=model.campaign_id,
            name=model.name,
            dm_id=model.dm_id,
            status=GameStatus.from_string(model.status),  # Convert string to enum
            location=model.location,
            party=[Player.from_dict(p) for p in model.party or []],
            max_players=model.max_players,
            adventure_logs=model.adventure_logs or [],
            combat_active=model.combat_active,
            turn_order=[TurnEntry.from_dict(t) for t in model.turn_order or []],
            current_session_number=model.current_session_number,
            total_play_time=model.total_play_time,
            mongodb_session_id=model.mongodb_session_id,
            created_at=model.created_at,
            last_activity_at=model.last_activity_at,
            started_at=model.started_at,
            ended_at=model.ended_at
        )
    
    def from_domain(self, domain: Game) -> Dict[str, Any]:
        """Convert domain object to database model data."""
        return {
            'id': domain.id,
            'campaign_id': domain.campaign_id,
            'name': domain.name,
            'dm_id': domain.dm_id,
            'status': domain.status.value,  # Convert enum to string value
            'location': domain.location,
            'party': [p.to_dict() for p in domain.party],
            'max_players': domain.max_players,
            'adventure_logs': domain.adventure_logs,
            'combat_active': domain.combat_active,
            'turn_order': [t.to_dict() for t in domain.turn_order],
            'current_session_number': domain.current_session_number,
            'total_play_time': domain.total_play_time,
            'mongodb_session_id': domain.mongodb_session_id,
            'created_at': domain.created_at,
            'last_activity_at': domain.last_activity_at,
            'started_at': domain.started_at,
            'ended_at': domain.ended_at
        }
    
    def get_by_id(self, game_id: UUID) -> Optional[Game]:
        """Get game by ID."""
        model = self.db.query(GameModel).filter(GameModel.id == game_id).first()
        
        if not model:
            return None
        
        return self.to_domain(model)
    
    def get_by_campaign_id(self, campaign_id: UUID) -> Optional[Game]:
        """Get game by campaign ID (one-to-one relationship)."""
        model = self.db.query(GameModel).filter(GameModel.campaign_id == campaign_id).first()
        
        if not model:
            return None
        
        return self.to_domain(model)
    
    def get_by_status(self, status: GameStatus) -> List[Game]:
        """Get all games with specific status."""
        # Convert enum to string value for database query
        models = self.db.query(GameModel).filter(GameModel.status == status.value).all()
        
        return [self.to_domain(model) for model in models]
    
    def create(self, game_domain: Game) -> Game:
        """Create a new game instance."""
        game_data = self.from_domain(game_domain)
        model = GameModel(**game_data)
        self.db.add(model)
        self.db.commit()
        self.db.refresh(model)
        return self.to_domain(model)
    
    def update(self, game_domain: Game) -> Optional[Game]:
        """Update an existing game."""
        game_domain.last_activity_at = datetime.utcnow()
        game_data = self.from_domain(game_domain)
        
        # Remove fields that don't need updating
        game_data.pop('id', None)
        game_data.pop('created_at', None)
        
        # Update the model
        updated_count = self.db.query(GameModel).filter(GameModel.id == game_domain.id).update(game_data)
        
        if updated_count > 0:
            self.db.commit()
            model = self.db.query(GameModel).filter(GameModel.id == game_domain.id).first()
            return self.to_domain(model)
        
        return None
    
    def update_status(self, game_id: UUID, status: GameStatus) -> Optional[Game]:
        """Update game status with timestamp tracking."""
        game = self.get_by_id(game_id)
        if not game:
            return None
        
        game.transition_to(status)
        
        return self.update(game)
    
    def delete(self, game_id: UUID) -> bool:
        """Delete a game instance."""
        deleted_count = self.db.query(GameModel).filter(GameModel.id == game_id).delete()
        self.db.commit()
        return deleted_count > 0
    
    def get_stuck_games(self, status: GameStatus, minutes_ago: int = 5) -> List[Game]:
        """Get games stuck in a specific status for recovery."""
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes_ago)
        
        models = self.db.query(GameModel).filter(
            GameModel.status == status.value,  # Convert enum to string value
            GameModel.last_activity_at < cutoff_time
        ).all()
        
        return [self.to_domain(model) for model in models]
    
