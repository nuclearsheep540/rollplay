# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.campaign import Campaign
from models.game import Game
from typing import List, Optional
from uuid import UUID

class CampaignService:
    """Service for campaign data operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_campaigns_by_user_id(self, user_id: UUID) -> List[Campaign]:
        """Get campaigns where user is DM"""
        return self.db.query(Campaign).filter(Campaign.dm_id == user_id).all()
    
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
        return self.db.query(Game).filter(Game.campaign_id == campaign_id).all()
    
    def get_campaign_by_id(self, campaign_id: UUID) -> Optional[Campaign]:
        """Get campaign by ID"""
        return self.db.query(Campaign).filter(Campaign.id == campaign_id).first()