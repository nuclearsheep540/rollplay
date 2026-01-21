# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field


# CAMPAIGN REQUEST SCHEMAS

class CampaignCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    hero_image: Optional[str] = Field(None, max_length=255)
    session_name: Optional[str] = Field(None, max_length=100)


class CampaignUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    hero_image: Optional[str] = Field(None, max_length=255)


class HostStatusResponse(BaseModel):
    is_host: bool
    session_id: str
    campaign_id: str


# CAMPAIGN RESPONSE SCHEMAS

class CampaignResponse(BaseModel):
    """Full campaign response with sessions - used for detail view"""
    id: str
    title: str
    description: Optional[str]
    hero_image: Optional[str]
    host_id: str
    host_screen_name: Optional[str] = None
    assets: Optional[dict]
    scenes: Optional[dict]
    npc_factory: Optional[dict]
    created_at: datetime
    updated_at: datetime
    sessions: List = []  # Sessions fetched separately via session module
    invited_player_ids: List[str] = []
    player_ids: List[str] = []
    total_sessions: int = 0
    active_sessions: int = 0
    invited_count: int = 0
    player_count: int = 0

    class Config:
        from_attributes = True  # Allow automatic conversion from aggregates


class CampaignSummaryResponse(BaseModel):
    """Lightweight campaign response without sessions - used for list view"""
    id: str
    title: str
    description: Optional[str]
    hero_image: Optional[str]
    host_id: str
    host_screen_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    total_sessions: int = 0
    active_sessions: int = 0
    invited_player_ids: List[str] = []
    player_ids: List[str] = []
    invited_count: int = 0

    class Config:
        from_attributes = True  # Allow automatic conversion from aggregates


class CampaignMemberResponse(BaseModel):
    """Campaign member with character details"""
    user_id: str
    username: str  # screen_name or email
    account_tag: Optional[str] = None
    character_id: Optional[str] = None
    character_name: Optional[str] = None
    character_level: Optional[int] = None
    character_class: Optional[str] = None  # Multi-class formatted
    character_race: Optional[str] = None
    is_host: bool = False
