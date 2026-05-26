# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Character API request + response schemas.

Reference-data endpoints (Phase 2.1) return the Pydantic models from
shared.rulesets.models directly — no separate DTO. The shapes below are only
for character resource endpoints (draft, runtime, level-up, listing).
"""

from datetime import datetime
from typing import Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from shared.rulesets.models import AbilityCode, CodePattern


# --------------------------------------------------------------------------- #
# Edition list
# --------------------------------------------------------------------------- #


class EditionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    name: str
    version: str
    is_active: bool


# --------------------------------------------------------------------------- #
# Character sub-resources
# --------------------------------------------------------------------------- #


class ClassEntryDTO(BaseModel):
    class_code: str = Field(pattern=CodePattern)
    level: int = Field(ge=1, le=20)
    is_primary: bool = False


class SkillProficiencyDTO(BaseModel):
    skill_code: str = Field(pattern=CodePattern)
    source: Literal["CLASS", "BACKGROUND", "FEAT", "SPECIES"]
    expertise: bool = False


class FeatAcquisitionDTO(BaseModel):
    feat_code: str = Field(pattern=CodePattern)
    level: int = Field(ge=1, le=20)
    source: Literal["BACKGROUND_ORIGIN", "ASI", "OTHER"]


class DerivedSkillModifier(BaseModel):
    skill_code: str
    ability: AbilityCode
    proficient: bool
    expertise: bool
    modifier: int


class DerivedSaveModifier(BaseModel):
    ability: AbilityCode
    proficient: bool
    modifier: int


class DerivedStats(BaseModel):
    """Ruleset-computed values surfaced alongside the stored character state."""

    proficiency_bonus: int
    initiative: int
    saves: List[DerivedSaveModifier]
    skills: List[DerivedSkillModifier]
    next_level_xp: Optional[int] = None
    pending_level_up: bool
    pending_asi_count: int


class CharacterResponse(BaseModel):
    """Full character sheet response — used by draft, runtime, listing, party endpoints."""

    id: UUID
    user_id: UUID
    edition_id: int
    edition_code: str
    active_campaign: Optional[UUID] = None

    character_name: str
    species_code: str
    background_code: str

    class_entries: List[ClassEntryDTO]
    ability_scores: Dict[AbilityCode, int]
    save_proficiencies: List[AbilityCode]
    skills: List[SkillProficiencyDTO]
    feats: List[FeatAcquisitionDTO]

    level: int
    xp: int
    hp_max: int
    hp_current: int
    hp_temp: int
    ac: int

    death_save_successes: int
    death_save_failures: int
    inspiration: bool
    status_effects: List[str]
    is_alive: bool

    speed: int
    size: str
    languages: List[str]

    is_draft: bool
    creation_step: Optional[str] = None

    display_name: str
    derived: DerivedStats

    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Draft requests
# --------------------------------------------------------------------------- #


class CreateDraftRequest(BaseModel):
    edition_code: str = Field(pattern=CodePattern)
    name: str = Field(min_length=1, max_length=50)


class IdentityStepPayload(BaseModel):
    species_code: str = Field(pattern=CodePattern)
    name: Optional[str] = Field(default=None, min_length=1, max_length=50)
    chosen_languages: List[str] = Field(default_factory=list)


class ClassPick(BaseModel):
    class_code: str = Field(pattern=CodePattern)
    level: int = Field(ge=1, le=20)
    is_primary: bool = False
    chosen_skills: List[str] = Field(default_factory=list)


class ClassStepPayload(BaseModel):
    classes: List[ClassPick] = Field(min_length=1, max_length=3)


class BackgroundAbilityIncrease(BaseModel):
    ability: AbilityCode
    increase: int = Field(ge=1, le=2)


class BackgroundStepPayload(BaseModel):
    background_code: str = Field(pattern=CodePattern)
    ability_increases: List[BackgroundAbilityIncrease] = Field(min_length=2, max_length=3)


class AbilityScoresStepPayload(BaseModel):
    strength: int = Field(ge=1, le=20)
    dexterity: int = Field(ge=1, le=20)
    constitution: int = Field(ge=1, le=20)
    intelligence: int = Field(ge=1, le=20)
    wisdom: int = Field(ge=1, le=20)
    charisma: int = Field(ge=1, le=20)


class HpAcStepPayload(BaseModel):
    hp_max: int = Field(ge=1)
    ac: int = Field(ge=1, le=50)


StepName = Literal["identity", "class", "background", "ability_scores", "hp_ac"]


class UpdateDraftRequest(BaseModel):
    step: StepName
    identity: Optional[IdentityStepPayload] = None
    class_: Optional[ClassStepPayload] = Field(default=None, alias="class")
    background: Optional[BackgroundStepPayload] = None
    ability_scores: Optional[AbilityScoresStepPayload] = None
    hp_ac: Optional[HpAcStepPayload] = None

    model_config = ConfigDict(populate_by_name=True)


# --------------------------------------------------------------------------- #
# Runtime endpoint
# --------------------------------------------------------------------------- #


class RuntimePatchRequest(BaseModel):
    """Partial update of a character's live-session state."""

    hp_current: Optional[int] = None
    hp_temp: Optional[int] = Field(default=None, ge=0)
    xp: Optional[int] = Field(default=None, ge=0)
    inspiration: Optional[bool] = None
    status_effects: Optional[List[str]] = None
    death_save_successes: Optional[int] = Field(default=None, ge=0, le=3)
    death_save_failures: Optional[int] = Field(default=None, ge=0, le=3)
    is_alive: Optional[bool] = None
    ac: Optional[int] = Field(default=None, ge=1, le=50)


# --------------------------------------------------------------------------- #
# Level-up endpoint
# --------------------------------------------------------------------------- #


class LevelUpPreview(BaseModel):
    """What's available at the next level — driven by ruleset + character state."""

    current_level: int
    target_level: int
    available_classes: List[str]  # which classes the player can put the level into
    is_asi_level: Dict[str, bool]  # class_code → whether *this* class's next level is an ASI level
    hp_options: Dict[str, Dict[str, int]]  # class_code → {average, max_roll}
    qualifying_feats: List[str]  # feat codes the character qualifies for at next level


class AsiChoice(BaseModel):
    increases: Dict[AbilityCode, int]


class FeatChoice(BaseModel):
    feat_code: str = Field(pattern=CodePattern)


class LevelUpRequest(BaseModel):
    class_code: str = Field(pattern=CodePattern)
    hp_choice: Literal["average", "roll"]
    roll_value: Optional[int] = None
    asi_choice: Optional[AsiChoice] = None
    feat_choice: Optional[FeatChoice] = None
    skill_choices: List[str] = Field(default_factory=list)
