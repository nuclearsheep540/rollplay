# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from shared.dependencies.db import get_db
from modules.campaign.repositories.campaign_repository import CampaignRepository

def campaign_repository(db: Session = Depends(get_db)) -> CampaignRepository:
    return CampaignRepository(db)