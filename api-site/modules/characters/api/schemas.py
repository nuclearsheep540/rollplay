# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


# REQUEST SCHEMAS

class CharacterCreateRequest(BaseModel):
    """
    Request schema for character creation.

    Only performs structural validation - business rules enforced in domain layer.
    """
    name: str = Field(..., min_length=1, max_length=50)
    character_class: str = Field(..., min_length=1, max_length=50)
    character_race: str = Field(..., min_length=1, max_length=50)
    level: int = Field(1, ge=1, le=20)
    stats: Optional[Dict[str, Any]] = None


# RESPONSE SCHEMAS

class CharacterResponse(BaseModel):
    """
    Character response schema - reused across all character endpoints.

    Used for both list and detail views. Optimized for typical use case
    where users have 3-10 characters with reasonable stats JSON size.
    """
    id: str
    user_id: str
    character_name: str
    character_class: str
    character_race: str
    level: int
    stats: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    display_name: str
