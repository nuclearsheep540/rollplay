# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.campaign_service import CampaignService
from models.campaign import Campaign
from models.game import Game
from typing import List
from uuid import UUID

class GetUserCampaigns:
    """Command to get all campaigns for a user"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, user_id: UUID) -> List[Campaign]:
        """Execute the command to get user's campaigns"""
        campaigns = self.campaign_service.get_campaigns_by_user_id(user_id)
        return campaigns

class CreateCampaign:
    """Command to create a new campaign"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, dm_id: UUID, name: str, description: str = None) -> Campaign:
        """Execute the command to create a campaign"""
        campaign = self.campaign_service.create_campaign(dm_id, name, description)
        return campaign

class GetCampaignGames:
    """Command to get all games for a campaign"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, campaign_id: UUID) -> List[Game]:
        """Execute the command to get campaign's games"""
        games = self.campaign_service.get_campaign_games(campaign_id)
        return games

class DeleteCampaign:
    """Command to soft delete a campaign"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, campaign_id: UUID) -> bool:
        """Execute the command to soft delete a campaign"""
        campaign = self.campaign_service.soft_delete_campaign(campaign_id)
        return campaign is not None