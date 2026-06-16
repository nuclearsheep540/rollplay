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


class ClassFeatureChoiceOption(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    description: str = ""


class ClassFeatureChoice(BaseModel):
    """A player choice attached to a class/subclass feature OR a species trait (reused for both)."""

    code: str = Field(pattern=CodePattern)
    name: str
    type: Literal[
        "single_pick", "feat_pick", "skill_proficiency", "weapon_mastery",
        "metamagic", "invocation", "spell_pick", "language", "tool_proficiency",
    ]
    count: int = 1
    source: Optional[list[str]] = None  # allowed code list when applicable (skills/spells/etc.)
    options: list[ClassFeatureChoiceOption] = []
    swappable_on: Optional[Literal["long_rest", "short_or_long_rest", "level_up"]] = None


class SkillDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    ability: AbilityCode


class FeatPrerequisite(BaseModel):
    type: Literal["level", "ability", "ability_any", "class", "class_feature", "spellcasting"]
    value: Optional[int] = None
    abilities: Optional[list[AbilityCode]] = None
    class_code: Optional[str] = Field(default=None, pattern=CodePattern)
    feature: Optional[str] = Field(default=None, pattern=CodePattern)  # for type="class_feature", e.g. "fighting_style"


class FeatDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    category: Literal["origin", "general", "fighting_style", "epic_boon"]
    prerequisites: list[FeatPrerequisite] = []
    repeatable: bool = False
    description: str = Field(min_length=1)


class SpellDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    level: int = Field(ge=0, le=9)  # 0 = cantrip
    school: str
    classes: list[str]  # class codes whose spell list this spell is on (inline in the SRD header)
    casting_time: str
    range: str
    components: str  # raw "V, S, M (…)" — material/cost kept verbatim
    duration: str
    ritual: bool = False
    concentration: bool = False
    description: str = Field(min_length=1)  # verbatim prose (incl. upcast clause, subsections)


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
    sub_choices: list[ClassFeatureChoice] = []  # lineage/ancestry/legacy/size picks (A.4); reuses the choice shape
    leveled_grants_by_sub_choice: dict[str, dict[str, list[str]]] = {}  # option code -> character level -> spell codes


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
    choices: list[ClassFeatureChoice] = []  # authored choice metadata, merged in at build time


class ClassLevel(BaseModel):
    proficiency_bonus: int = Field(ge=2, le=6)
    features: list[ClassFeature]
    class_specific: dict[str, str | int]


class SkillChoices(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    count: int = Field(ge=0)
    source: list[str] = Field(alias="from")


class SubclassFeature(BaseModel):
    name: str
    level: int = Field(ge=1, le=20)
    description: str = Field(min_length=1)


class SubclassDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    subclass_level: int = Field(ge=1, le=20)  # level at which this subclass's features begin
    features: list[SubclassFeature]
    # Spell codes the subclass always has prepared, keyed by class level (Cleric/Paladin/
    # Sorcerer/Warlock domain/oath/patron spells).
    always_prepared_spells_by_level: dict[str, list[str]] = {}
    # Choice-dependent always-prepared spells (Druid Circle of the Land): land code -> level -> codes.
    leveled_grants_by_sub_choice: dict[str, dict[str, list[str]]] = {}


class PactSlot(BaseModel):
    count: int = Field(ge=0)             # number of Pact Magic slots
    slot_level: int = Field(ge=1, le=9)  # spell level those slots are cast at


class SpellcasterProgression(BaseModel):
    """Per-character-level spell progression, lifted from the class table (A.6).

    All dicts are keyed by character level ("1".."20"); a level absent from a dict means
    none at that level. Regular casters populate ``spell_slots_by_level``; Warlock uses
    ``pact_slots_by_level`` instead. Paladin/Ranger have no cantrips, so
    ``cantrips_known_by_level`` is empty for them.
    """

    cantrips_known_by_level: dict[str, int] = {}
    prepared_spells_by_level: dict[str, int] = {}
    spell_slots_by_level: dict[str, dict[str, int]] = {}  # char level -> {spell level -> slots}
    pact_slots_by_level: dict[str, PactSlot] = {}         # Warlock only


class ClassDefinition(BaseModel):
    code: str = Field(pattern=CodePattern)
    name: str
    primary_ability: list[AbilityCode] = Field(min_length=1)  # some classes list two (e.g. "Strength or Dexterity")
    hit_die: Literal[6, 8, 10, 12]
    saving_throw_proficiencies: list[AbilityCode] = Field(min_length=2, max_length=2)
    skill_choices: SkillChoices
    armor_training: list[str]
    weapon_proficiencies: list[str]
    tool_proficiencies: str = ""  # raw core-table text (e.g. "Choose 3 Musical Instruments", "Herbalism Kit")
    starting_equipment_text: str
    asi_levels: list[int] = Field(min_length=4)
    features_by_level: dict[str, ClassLevel]
    multiclass_text: Optional[str] = None
    subclass_level: Optional[int] = None  # character level at which a subclass is chosen (3 in SRD 2024)
    subclasses: list[SubclassDefinition] = []
    spellcasting: Optional[SpellcasterProgression] = None  # None for non-casters; lifted from the class table


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


class SpellsFile(_EditionFile):
    spells: list[SpellDefinition]
