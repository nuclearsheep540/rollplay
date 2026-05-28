# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Pydantic models that define the shape of the ruleset reference data.

These models serve four roles:
1. Schema authority for the JSON seed files under modules/characters/seed_data/
2. Parser output validation (api-site/scripts/parse_srd.py)
3. Runtime registry typing (shared/rulesets/registry.py)
4. API response shapes for reference data endpoints

The CodePattern regex enforces the to_code() normalization rule from the
Phase 0 plan: identifiers must be lowercase ASCII with underscores only.
"""

from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


AbilityCode = Literal[
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "wisdom",
    "charisma",
]

CodePattern = r"^[a-z0-9_]+$"

CURRENT_SCHEMA_VERSION = 1


class SkillDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    ability: AbilityCode


class FeatPrerequisite(BaseModel):
    type: Literal["level", "ability", "ability_any", "class", "spellcasting"]
    value: Optional[int] = None
    abilities: Optional[list[AbilityCode]] = None
    class_code: Optional[str] = Field(default=None, pattern=CodePattern)


class FeatDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    category: Literal["origin", "general", "fighting_style", "epic_boon"]
    prerequisites: list[FeatPrerequisite] = []
    repeatable: bool = False
    description: str = Field(min_length=1)


class SpeciesTrait(BaseModel):
    name: str
    description: str = Field(min_length=1)


class LanguageChoices(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(ge=1)
    source: str = Field(alias="from")


class SpeciesDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    creature_type: str
    size: Literal["Small", "Medium", "Large"]
    speed: int = Field(ge=0)
    default_languages: list[str]
    language_choices: Optional[LanguageChoices] = None
    traits: list[SpeciesTrait]


class BackgroundDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    ability_scores: list[AbilityCode] = Field(min_length=3, max_length=3)
    origin_feat_code: str = Field(pattern=CodePattern)
    skill_proficiencies: list[str] = Field(min_length=2, max_length=2)
    tool_proficiency: str
    equipment_text: str


class ClassFeature(BaseModel):
    name: str
    description: str = Field(min_length=1)


class ClassLevel(BaseModel):
    proficiency_bonus: int = Field(ge=2, le=6)
    features: list[ClassFeature]
    class_specific: dict[str, str | int]


class SkillChoices(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(ge=0)
    source: list[str] = Field(alias="from")


class ClassDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    primary_ability: AbilityCode
    hit_die: Literal[6, 8, 10, 12]
    saving_throw_proficiencies: list[AbilityCode] = Field(min_length=2, max_length=2)
    skill_choices: SkillChoices
    armor_training: list[str]
    weapon_proficiencies: list[str]
    starting_equipment_text: str
    asi_levels: list[int] = Field(min_length=4)
    features_by_level: dict[str, ClassLevel]
    multiclass_text: Optional[str] = None


class _EditionFile(BaseModel):
    schema_version: int = CURRENT_SCHEMA_VERSION
    edition: str


class SkillsFile(_EditionFile):
    skills: list[SkillDefinition]


class FeatsFile(_EditionFile):
    feats: list[FeatDefinition]


class SpeciesFile(_EditionFile):
    species: list[SpeciesDefinition]


class BackgroundsFile(_EditionFile):
    backgrounds: list[BackgroundDefinition]


class ClassesFile(_EditionFile):
    classes: list[ClassDefinition]
