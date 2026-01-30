# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from pydantic import BaseModel
from typing import List, Optional


class AssetRef(BaseModel):
    """Reference to an asset from the library (api-site PostgreSQL)"""
    id: str
    filename: str
    s3_key: str
    asset_type: str  # "map", "audio", "image"
    s3_url: Optional[str] = None  # Presigned download URL


class SessionStartRequest(BaseModel):
    """Request to create a new active game in MongoDB for a session"""
    session_id: str  # PostgreSQL session ID from api-site
    campaign_id: str  # PostgreSQL campaign ID - used for proxying asset requests to api-site
    dm_username: str
    max_players: int = 8
    joined_user_ids: List[str] = []  # List of user IDs who are already part of the session
    assets: List[AssetRef] = []  # Assets associated with the session's campaign (legacy, prefer proxy)


class SessionStartResponse(BaseModel):
    """Response after creating a game session"""
    success: bool
    session_id: str
    message: str


class SessionEndRequest(BaseModel):
    """Request to end a game and return final state for session"""
    session_id: str  # PostgreSQL session ID from api-site


class SessionEndResponse(BaseModel):
    """Response with final game state"""
    success: bool
    final_state: dict
    message: str = ""
