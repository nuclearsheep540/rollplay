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
            status=model.status,
            location=model.location,
            party=[Player.from_dict(p) for p in model.party or []],
            max_players=model.max_players,
            adventure_logs=model.adventure_logs or [],
            combat_active=model.combat_active,
            turn_order=[TurnEntry.from_dict(t) for t in model.turn_order or []],
            current_session_number=model.current_session_number,
            total_play_time=model.total_play_time,
            created_at=model.created_at,
            last_activity_at=model.last_activity_at
        )
    
    def from_domain(self, domain: Game) -> Dict[str, Any]:
        """Convert domain object to database model data."""
        return {
            'id': domain.id,
            'campaign_id': domain.campaign_id,
            'name': domain.name,
            'dm_id': domain.dm_id,
            'status': domain.status,
            'location': domain.location,
            'party': [p.to_dict() for p in domain.party],
            'max_players': domain.max_players,
            'adventure_logs': domain.adventure_logs,
            'combat_active': domain.combat_active,
            'turn_order': [t.to_dict() for t in domain.turn_order],
            'current_session_number': domain.current_session_number,
            'total_play_time': domain.total_play_time,
            'created_at': domain.created_at,
            'last_activity_at': domain.last_activity_at
        }
    
    async def get_by_id(self, game_id: UUID) -> Optional[Game]:
        """Get game by ID."""
        query = select(GameModel).where(GameModel.id == game_id)
        result = await self.db.execute(query)
        model = result.scalar_one_or_none()
        
        if not model:
            return None
        
        return self.to_domain(model)
    
    async def get_by_campaign_id(self, campaign_id: UUID) -> Optional[Game]:
        """Get game by campaign ID (one-to-one relationship)."""
        query = select(GameModel).where(GameModel.campaign_id == campaign_id)
        result = await self.db.execute(query)
        model = result.scalar_one_or_none()
        
        if not model:
            return None
        
        return self.to_domain(model)
    
    async def get_by_status(self, status: GameStatus) -> List[Game]:
        """Get all games with specific status."""
        query = select(GameModel).where(GameModel.status == status)
        result = await self.db.execute(query)
        models = result.scalars().all()
        
        return [self.to_domain(model) for model in models]
    
    async def create(self, game_domain: Game) -> Game:
        """Create a new game instance."""
        game_data = self.from_domain(game_domain)
        model = GameModel(**game_data)
        self.db.add(model)
        await self.db.commit()
        await self.db.refresh(model)
        return self.to_domain(model)
    
    async def update(self, game_domain: Game) -> Optional[Game]:
        """Update an existing game."""
        game_domain.last_activity_at = datetime.utcnow()
        game_data = self.from_domain(game_domain)
        
        query = (
            update(GameModel)
            .where(GameModel.id == game_domain.id)
            .values(**game_data)
            .returning(GameModel)
        )
        
        result = await self.db.execute(query)
        model = result.scalar_one_or_none()
        
        if model:
            await self.db.commit()
            await self.db.refresh(model)
            return self.to_domain(model)
        
        return None
    
    async def update_status(self, game_id: UUID, status: GameStatus) -> Optional[Game]:
        """Update game status with timestamp tracking."""
        game = await self.get_by_id(game_id)
        if not game:
            return None
        
        game.transition_to(status)
        
        # Add specific timestamp fields based on status
        if status == GameStatus.ACTIVE:
            game.started_at = datetime.utcnow()
        elif status == GameStatus.INACTIVE:
            game.ended_at = datetime.utcnow()
        
        return await self.update(game)
    
    async def delete(self, game_id: UUID) -> bool:
        """Delete a game instance."""
        query = delete(GameModel).where(GameModel.id == game_id)
        result = await self.db.execute(query)
        await self.db.commit()
        return result.rowcount > 0
    
    async def get_stuck_games(self, status: GameStatus, minutes_ago: int = 5) -> List[Game]:
        """Get games stuck in a specific status for recovery."""
        cutoff_time = datetime.utcnow() - timedelta(minutes=minutes_ago)
        
        query = (
            select(GameModel)
            .where(
                GameModel.status == status,
                GameModel.last_activity_at < cutoff_time
            )
        )
        
        result = await self.db.execute(query)
        models = result.scalars().all()
        
        return [self.to_domain(model) for model in models]
    
