# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.game import Game
from models.game_player import GamePlayers
from models.character import Character
from typing import List, Optional
from uuid import UUID

class CampaignService:
    """Service for campaign/game data operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_campaigns_by_user_id(self, user_id: UUID) -> List[Game]:
        """Get all campaigns where user is a player or DM"""
        # Get campaigns where user is DM
        dm_campaigns = self.db.query(Game).filter(Game.dm_id == user_id).all()
        
        # Get campaigns where user is a player (through their characters)
        player_campaigns = self.db.query(Game).join(GamePlayers).join(Character).filter(Character.user_id == user_id).all()
        
        # Combine and deduplicate
        all_campaigns = dm_campaigns + player_campaigns
        unique_campaigns = list({campaign.id: campaign for campaign in all_campaigns}.values())
        
        return unique_campaigns
    
    def get_campaign_by_id(self, campaign_id: UUID) -> Optional[Game]:
        """Get a specific campaign by ID"""
        return self.db.query(Game).filter(Game.id == campaign_id).first()
    
    def create_campaign(self, dm_id: UUID, name: str, description: str = None) -> Game:
        """Create a new campaign"""
        new_campaign = Game(
            dm_id=dm_id,
            name=name,
            description=description
        )
        self.db.add(new_campaign)
        self.db.commit()
        self.db.refresh(new_campaign)
        return new_campaign