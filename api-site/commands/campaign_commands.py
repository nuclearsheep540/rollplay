# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.campaign_service import CampaignService
from typing import List
from uuid import UUID

class GetUserCampaigns:
    """Command to get all campaigns for a user"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, user_id: UUID) -> List:
        """Execute the command to get user's campaigns"""
        campaigns = self.campaign_service.get_campaigns_by_user_id(user_id)
        return campaigns

class CreateCampaign:
    """Command to create a new campaign"""
    
    def __init__(self, db: Session):
        self.campaign_service = CampaignService(db)
    
    def execute(self, dm_id: UUID, name: str, description: str = None):
        """Execute the command to create a campaign"""
        campaign = self.campaign_service.create_campaign(dm_id, name, description)
        return campaign