# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from typing import Optional
from datetime import datetime
from uuid import UUID

class CampaignResponse(BaseModel):
    """Schema for campaign data returned by API"""
    id: UUID
    name: str
    description: Optional[str]
    dm_id: UUID
    status: str
    created_at: datetime
    
    class Config:
        from_attributes = True  # For SQLAlchemy models

class CampaignCreate(BaseModel):
    """Schema for creating a new campaign"""
    name: str
    description: Optional[str] = None