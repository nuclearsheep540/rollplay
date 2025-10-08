# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field


# REQUEST SCHEMAS

class GameCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=100)
    max_players: int = Field(6, ge=1, le=20)


class GameUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    max_players: Optional[int] = Field(None, ge=1, le=20)


class GameStartRequest(BaseModel):
    mongodb_session_id: str = Field(...)


# RESPONSE SCHEMAS

class GameResponse(BaseModel):
    """Game response schema - used for both list and detail views"""
    id: str
    name: str
    campaign_id: str
    dm_id: str
    max_players: int
    status: str
    mongodb_session_id: Optional[str]
    created_at: datetime
    updated_at: datetime
    started_at: Optional[datetime]
    ended_at: Optional[datetime]
    session_duration_seconds: Optional[int] = None


class DMStatusResponse(BaseModel):
    is_dm: bool
    game_id: str
    campaign_id: str
