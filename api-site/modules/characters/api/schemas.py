# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict
from pydantic import BaseModel, Field

from modules.characters.domain.character_aggregate import CharacterRace, CharacterClass


# REQUEST SCHEMAS

class AbilityScoresRequest(BaseModel):
    """Pydantic schema for ability scores input"""
    strength: int = Field(..., ge=1, le=30, description="Strength score (1-30)")
    dexterity: int = Field(..., ge=1, le=30, description="Dexterity score (1-30)")
    constitution: int = Field(..., ge=1, le=30, description="Constitution score (1-30)")
    intelligence: int = Field(..., ge=1, le=30, description="Intelligence score (1-30)")
    wisdom: int = Field(..., ge=1, le=30, description="Wisdom score (1-30)")
    charisma: int = Field(..., ge=1, le=30, description="Charisma score (1-30)")


class CharacterCreateRequest(BaseModel):
    """
    Request schema for character creation.

    Only performs structural validation - business rules enforced in domain layer.
    """
    name: str = Field(..., min_length=1, max_length=50, description="Character name")
    character_class: CharacterClass = Field(..., description="D&D 5e character class")
    character_race: CharacterRace = Field(..., description="D&D 5e character race")
    level: int = Field(1, ge=1, le=20, description="Character level (1-20)")
    ability_scores: Optional[AbilityScoresRequest] = Field(
        None,
        description="Ability scores (defaults to 1 for all if omitted)"
    )


class UpdateAbilityScoresRequest(BaseModel):
    """Request schema for updating ability scores - all fields optional for partial updates"""
    strength: Optional[int] = Field(None, ge=1, description="Strength score")
    dexterity: Optional[int] = Field(None, ge=1, description="Dexterity score")
    constitution: Optional[int] = Field(None, ge=1, description="Constitution score")
    intelligence: Optional[int] = Field(None, ge=1, description="Intelligence score")
    wisdom: Optional[int] = Field(None, ge=1, description="Wisdom score")
    charisma: Optional[int] = Field(None, ge=1, description="Charisma score")


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
    character_class: str  # Enum value as string
    character_race: str   # Enum value as string
    level: int
    ability_scores: Dict[str, int]  # Serialized AbilityScores
    created_at: datetime
    updated_at: datetime
    display_name: str
