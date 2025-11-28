# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict, List
from pydantic import BaseModel, Field, validator

from modules.characters.domain.character_aggregate import CharacterRace, CharacterClass, CharacterBackground


# REQUEST SCHEMAS

class AbilityScoresRequest(BaseModel):
    """Pydantic schema for ability scores input - D&D 5e cap at 20"""
    strength: int = Field(..., ge=1, le=20, description="Strength score (1-20)")
    dexterity: int = Field(..., ge=1, le=20, description="Dexterity score (1-20)")
    constitution: int = Field(..., ge=1, le=20, description="Constitution score (1-20)")
    intelligence: int = Field(..., ge=1, le=20, description="Intelligence score (1-20)")
    wisdom: int = Field(..., ge=1, le=20, description="Wisdom score (1-20)")
    charisma: int = Field(..., ge=1, le=20, description="Charisma score (1-20)")


class CharacterClassInfoRequest(BaseModel):
    """
    Request schema for a single character class with level.
    Used for multi-class character support.
    """
    character_class: CharacterClass = Field(..., description="D&D 5e character class")
    level: int = Field(..., ge=1, le=20, description="Level in this class (1-20)")


class CharacterCreateRequest(BaseModel):
    """
    Request schema for character creation.

    Supports multi-class characters (1-3 classes).
    Only performs structural validation - business rules enforced in domain layer.
    """
    name: str = Field(..., min_length=1, max_length=50, description="Character name")
    character_classes: List[CharacterClassInfoRequest] = Field(
        ...,
        min_items=1,
        max_items=3,
        description="Character classes (1-3 classes for multi-classing)"
    )
    character_race: CharacterRace = Field(..., description="D&D 5e character race")
    background: Optional[CharacterBackground] = Field(None, description="D&D 2024 character background")
    level: int = Field(1, ge=1, le=20, description="Total character level (1-20)")
    hp_max: int = Field(1, ge=1, le=999, description="Character max hit points (1-999)")
    hp_current: int = Field(1, ge=-100, le=999, description="Character current hit points (-100 to 999, negative for unconscious)")
    ac: int = Field(1, ge=1, le=50, description="Character armour class (1-50)")
    ability_scores: Optional[AbilityScoresRequest] = Field(
        None,
        description="Ability scores (defaults to 10 for all if omitted)"
    )
    origin_ability_bonuses: Optional[Dict[str, int]] = Field(
        None,
        description="D&D 2024 origin ability bonuses from background (e.g., {'strength': 2, 'constitution': 1})"
    )

    @validator('character_classes')
    def validate_class_levels(cls, v, values):
        """Validate that sum of class levels matches total level"""
        if 'level' in values:
            total_class_levels = sum(c.level for c in v)
            if total_class_levels != values['level']:
                raise ValueError(
                    f"Sum of class levels ({total_class_levels}) must equal total character level ({values['level']})"
                )
        return v

# TODO: this is DRY as AbilityScoresRequest is the same, refactor.
class UpdateAbilityScoresRequest(BaseModel):
    """Request schema for updating ability scores - all fields optional for partial updates"""
    strength: Optional[int] = Field(None, ge=1, description="Strength score")
    dexterity: Optional[int] = Field(None, ge=1, description="Dexterity score")
    constitution: Optional[int] = Field(None, ge=1, description="Constitution score")
    intelligence: Optional[int] = Field(None, ge=1, description="Intelligence score")
    wisdom: Optional[int] = Field(None, ge=1, description="Wisdom score")
    charisma: Optional[int] = Field(None, ge=1, description="Charisma score")


# RESPONSE SCHEMAS

class CharacterClassInfoResponse(BaseModel):
    """
    Response schema for a single character class with level.
    Used for multi-class character display.
    """
    character_class: str  # Enum value as string (e.g., "Fighter")
    level: int


class CharacterResponse(BaseModel):
    """
    Character response schema - reused across all character endpoints.

    Supports multi-class characters with 1-3 classes.
    Used for both list and detail views. Optimized for typical use case
    where users have 3-10 characters with reasonable stats JSON size.
    """
    id: str
    user_id: str
    character_name: str
    character_classes: List[CharacterClassInfoResponse]  # List of classes with levels
    character_race: str   # Enum value as string
    background: Optional[str] = None  # D&D 2024 background (enum value as string)
    level: int  # Total character level (sum of all class levels)
    ability_scores: Dict[str, int]  # Serialized AbilityScores
    origin_ability_bonuses: Optional[Dict[str, int]] = None  # D&D 2024 origin bonuses
    created_at: datetime
    updated_at: datetime
    display_name: str  # Formatted name with all classes (e.g., "Aragorn (Level 8 Fighter 5 / Ranger 3)")
    hp_max: int
    hp_current: int
    ac: int
    active_game: Optional[str] = None  # UUID of game character is currently in
