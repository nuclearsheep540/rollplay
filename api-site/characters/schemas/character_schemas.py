# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class CharacterCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50, description="Character name")
    character_class: str = Field(..., min_length=1, max_length=30, description="Character class")
    level: int = Field(1, ge=1, le=20, description="Character level")
    stats: Optional[Dict[str, Any]] = Field(None, description="Character stats/sheet data")


class CharacterUpdateRequest(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=50, description="Character name")
    character_class: Optional[str] = Field(None, min_length=1, max_length=30, description="Character class")
    level: Optional[int] = Field(None, ge=1, le=20, description="Character level")


class CharacterStatsUpdateRequest(BaseModel):
    stats: Dict[str, Any] = Field(..., description="Character stats/sheet data")


class CharacterResponse(BaseModel):
    id: str
    user_id: str
    name: str
    character_class: str
    level: int
    stats: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    display_name: str
    
    @classmethod
    def from_aggregate(cls, aggregate):
        """Create response from Character aggregate"""
        return cls(
            id=str(aggregate.id),
            user_id=str(aggregate.user_id),
            name=aggregate.name,
            character_class=aggregate.character_class,
            level=aggregate.level,
            stats=aggregate.stats,
            created_at=aggregate.created_at,
            updated_at=aggregate.updated_at,
            display_name=aggregate.get_display_name()
        )
    
    class Config:
        from_attributes = True


class CharacterSummaryResponse(BaseModel):
    """Lightweight character response for lists"""
    id: str
    name: str
    character_class: str
    level: int
    created_at: datetime
    display_name: str
    
    @classmethod
    def from_aggregate(cls, aggregate):
        """Create summary response from Character aggregate"""
        return cls(
            id=str(aggregate.id),
            name=aggregate.name,
            character_class=aggregate.character_class,
            level=aggregate.level,
            created_at=aggregate.created_at,
            display_name=aggregate.get_display_name()
        )
