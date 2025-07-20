# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from campaign.orm.campaign_model import Campaign as CampaignModel
from campaign.orm.game_model import Game as GameModel
from campaign.domain.aggregates import CampaignAggregate
from campaign.game.domain.entities import GameEntity
from campaign.adapters.mappers import to_domain, from_domain, update_model_from_domain


class CampaignRepository:
    """Repository handling both Campaign aggregate and Game entity persistence"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
    
    def get_by_id(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID with all its games"""
        model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )
        return to_domain(model) if model else None
    
    def get_by_dm_id(self, dm_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is DM"""
        models = (
            self.db.query(CampaignModel)
            .filter_by(dm_id=dm_id)
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        return [to_domain(model) for model in models]
    
    def get_by_member_id(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is either DM or player"""
        from sqlalchemy import or_, func
        
        user_id_str = str(user_id)
        
        models = (
            self.db.query(CampaignModel)
            .filter(
                or_(
                    CampaignModel.dm_id == user_id,  # User is DM
                    func.json_array_length(CampaignModel.player_ids) > 0,  # Has players
                    CampaignModel.player_ids.op('?')(user_id_str)  # User ID in player_ids JSON array
                )
            )
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        
        # Filter in Python to handle JSON array membership more reliably
        result = []
        for model in models:
            campaign = to_domain(model)
            if campaign.is_member(user_id):
                result.append(campaign)
        
        return result
    
    def save(self, aggregate: CampaignAggregate) -> UUID:
        """Save campaign aggregate with all games"""
        if aggregate.id:
            # Update existing campaign
            campaign_model = (
                self.db.query(CampaignModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not campaign_model:
                raise ValueError(f"Campaign {aggregate.id} not found")
            
            update_model_from_domain(campaign_model, aggregate)
            
            # Update games - handle creates, updates, deletes
            self._sync_games(campaign_model, aggregate.games)
            
        else:
            # Create new campaign
            campaign_model = from_domain(aggregate)
            self.db.add(campaign_model)
            
            # Flush to get the ID before adding games
            self.db.flush()
            aggregate.id = campaign_model.id
            
            # Add games if any
            for game in aggregate.games:
                game.campaign_id = campaign_model.id
                game_model = self._game_from_domain(game)
                self.db.add(game_model)
        
        self.db.commit()
        self.db.refresh(campaign_model)
        return campaign_model.id
    
    def delete(self, campaign_id: UUID) -> bool:
        """Soft delete campaign and all its games"""
        campaign_model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )
        
        if not campaign_model:
            return False
        
        # Business rule validation through aggregate
        campaign = to_domain(campaign_model)
        if not campaign.can_be_deleted():
            raise ValueError("Cannot delete campaign with active games")
        
        # Soft delete all games first
        self.db.query(GameModel).filter_by(campaign_id=campaign_id).delete()
        
        # Soft delete campaign
        self.db.delete(campaign_model)
        self.db.commit()
        return True
    
    def get_game_by_id(self, game_id: UUID) -> Optional[GameEntity]:
        """Get a specific game entity"""
        model = (
            self.db.query(GameModel)
            .filter_by(id=game_id)
            .first()
        )
        return self._game_to_domain(model) if model else None
    
    def save_game(self, game: GameEntity) -> UUID:
        """Save individual game entity"""
        if game.id:
            # Update existing
            model = (
                self.db.query(GameModel)
                .filter_by(id=game.id)
                .first()
            )
            if not model:
                raise ValueError(f"Game {game.id} not found")
            
            self._update_game_model_from_domain(model, game)
        else:
            # Create new
            model = self._game_from_domain(game)
            self.db.add(model)
        
        self.db.commit()
        self.db.refresh(model)
        
        if not game.id:
            game.id = model.id
        
        return model.id
    
    def _sync_games(self, campaign_model: CampaignModel, games: List[GameEntity]):
        """Synchronize games with database"""
        # Get current games from database
        current_games = {game.id: game for game in campaign_model.games}
        new_games = {game.id: game for game in games if game.id}
        
        # Handle updates
        for game in games:
            if game.id and game.id in current_games:
                # Update existing
                self._update_game_model_from_domain(current_games[game.id], game)
            elif not game.id:
                # Create new
                game_model = self._game_from_domain(game)
                game_model.campaign_id = campaign_model.id
                self.db.add(game_model)
        
        # Handle deletions (games in DB but not in aggregate)
        for game_id in current_games:
            if game_id not in new_games:
                self.db.delete(current_games[game_id])
    
    def _game_to_domain(self, model: GameModel) -> GameEntity:
        """Convert Game ORM model to domain entity"""
        if not model:
            return None
        
        from campaign.game.domain.entities import GameStatus
        
        return GameEntity(
            id=model.id,
            name=model.name,
            campaign_id=model.campaign_id,
            dm_id=model.dm_id,
            max_players=model.max_players,
            status=GameStatus(model.status),
            mongodb_session_id=model.mongodb_session_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            started_at=model.started_at,
            ended_at=model.ended_at
        )
    
    def _game_from_domain(self, entity: GameEntity) -> GameModel:
        """Convert Game domain entity to ORM model"""
        return GameModel(
            id=entity.id,
            name=entity.name,
            campaign_id=entity.campaign_id,
            dm_id=entity.dm_id,
            max_players=entity.max_players,
            status=entity.status.value,
            mongodb_session_id=entity.mongodb_session_id,
            created_at=entity.created_at,
            updated_at=entity.updated_at,
            started_at=entity.started_at,
            ended_at=entity.ended_at
        )
    
    def _update_game_model_from_domain(self, model: GameModel, entity: GameEntity):
        """Update Game ORM model from domain entity"""
        model.name = entity.name
        model.max_players = entity.max_players
        model.status = entity.status.value
        model.mongodb_session_id = entity.mongodb_session_id
        model.updated_at = entity.updated_at
        model.started_at = entity.started_at
        model.ended_at = entity.ended_at