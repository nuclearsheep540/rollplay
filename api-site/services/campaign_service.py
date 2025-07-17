# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.campaign import Campaign
from models.game import Game
from enums.game_status import GameStatus
from typing import List, Optional
from uuid import UUID

class CampaignService:
    """Service for campaign data operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_campaigns_by_user_id(self, user_id: UUID) -> List[Campaign]:
        """Get campaigns where user is DM (excluding deleted)"""
        return self.db.query(Campaign).filter(
            Campaign.dm_id == user_id,
            Campaign.is_deleted == False
        ).all()
    
    def create_campaign(self, dm_id: UUID, name: str, description: str = None) -> Campaign:
        """Create new campaign"""
        campaign = Campaign(
            dm_id=dm_id,
            name=name,
            description=description
        )
        self.db.add(campaign)
        self.db.commit()
        self.db.refresh(campaign)
        return campaign
    
    def get_campaign_games(self, campaign_id: UUID) -> List[Game]:
        """Get all games for a campaign"""
        from repositories.game_repository import GameRepository
        game_repository = GameRepository(self.db)
        
        # Get all games for the campaign through the repository
        all_games = game_repository.get_by_status(GameStatus.INACTIVE) + \
                   game_repository.get_by_status(GameStatus.ACTIVE) + \
                   game_repository.get_by_status(GameStatus.STARTING) + \
                   game_repository.get_by_status(GameStatus.STOPPING)
        
        # Filter by campaign_id
        return [game for game in all_games if game.campaign_id == campaign_id]
    
    def get_campaign_by_id(self, campaign_id: UUID) -> Optional[Campaign]:
        """Get campaign by ID (excluding deleted)"""
        return self.db.query(Campaign).filter(
            Campaign.id == campaign_id,
            Campaign.is_deleted == False
        ).first()
    
    def soft_delete_campaign(self, campaign_id: UUID) -> Optional[Campaign]:
        """Soft delete a campaign"""
        from datetime import datetime
        from repositories.game_repository import GameRepository
        from enums.game_status import GameStatus
        
        campaign = self.db.query(Campaign).filter(Campaign.id == campaign_id).first()
        if not campaign:
            return None
        
        # Check if campaign has any active games
        game_repository = GameRepository(self.db)
        active_games = game_repository.get_by_status(GameStatus.ACTIVE)
        starting_games = game_repository.get_by_status(GameStatus.STARTING)
        stopping_games = game_repository.get_by_status(GameStatus.STOPPING)
        
        # Check if any games belong to this campaign
        campaign_active_games = [
            game for game in (active_games + starting_games + stopping_games)
            if game.campaign_id == campaign_id
        ]
        
        if campaign_active_games:
            raise ValueError(f"Cannot delete campaign with active games. Found {len(campaign_active_games)} active game(s).")
            
        campaign.is_deleted = True
        campaign.deleted_at = datetime.utcnow()
        
        self.db.commit()
        self.db.refresh(campaign)
        return campaign