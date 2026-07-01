# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Character API request + response schemas.

Reference-data endpoints (Phase 2.1) return the Pydantic models from
shared.rulesets.models directly — no separate DTO. The shapes below are only
for character resource endpoints (draft, runtime, level-up, listing).
"""

from datetime import datetime
from typing import Any, Dict, List, Literal, Optional
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from shared.rulesets.models import AbilityCode, CodePattern


AbilityScoreMethod = Literal["point_buy", "standard_array", "rolled", "manual"]


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
    sub_choices: Dict[str, List[str]] = {}  # L1 feature-choice picks: {choice_code: [picked_codes]}


class SkillProficiencyDTO(BaseModel):
    skill_code: str = Field(pattern=CodePattern)
    source: Literal["CLASS", "BACKGROUND", "FEAT", "SPECIES"]
    expertise: bool = False


class FeatAcquisitionDTO(BaseModel):
    feat_code: str = Field(pattern=CodePattern)
    level: int = Field(ge=1, le=20)
    source: Literal["BACKGROUND_ORIGIN", "ASI", "OTHER"]


class SpellSelectionDTO(BaseModel):
    spell_code: str = Field(pattern=CodePattern)
    spell_level: int = Field(ge=0, le=9)  # 0 = cantrip
    source: str  # one of SPELL_SOURCES (class_known / class_prepared / always_prepared / …)
    granted_by: str = ""
    casting_ability: Optional[AbilityCode] = None


class ResourceUsageDTO(BaseModel):
    """Raw stored resource state — uses consumed (0/absent = full). Max is in DerivedStats."""
    pool_code: str
    current_value: int = Field(ge=0)


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


class PactSlotDTO(BaseModel):
    count: int
    slot_level: int


class ResourcePoolDTO(BaseModel):
    """A class resource pool, joining the ruleset max with the stored spent count (G.1)."""
    pool_code: str
    max_value: int
    current_value: int  # uses spent (remaining = max_value - current_value)
    recharge: str       # "short_rest" | "long_rest"


class ACMethodDTO(BaseModel):
    code: str
    label: str
    ac: int


class DerivedStats(BaseModel):
    """Ruleset-computed values surfaced alongside the stored character state."""

    proficiency_bonus: int
    initiative: int
    saves: List[DerivedSaveModifier]
    skills: List[DerivedSkillModifier]
    next_level_xp: Optional[int] = None
    pending_level_up: bool
    pending_asi_count: int
    # Spellcasting (empty / null for non-casters). spell_slots is {spell_level: count};
    # the DC/attack maps are keyed by the casting ability so the UI can render per-class.
    spell_slots: Dict[int, int] = {}
    pact_slots: Optional[PactSlotDTO] = None
    spell_save_dc_by_ability: Dict[AbilityCode, int] = {}
    spell_attack_bonus_by_ability: Dict[AbilityCode, int] = {}
    # Resource pools (max joined with stored spent) + AC computation options.
    resource_pools: List[ResourcePoolDTO] = []
    ac_methods: List[ACMethodDTO] = []


class CharacterResponse(BaseModel):
    """Full character sheet response — used by draft, runtime, listing, party endpoints."""

    id: UUID
    user_id: UUID
    edition_id: int
    edition_code: str
    active_campaign: Optional[UUID] = None

    character_name: str
    species_code: str
    species_sub_choices: Dict[str, List[str]] = {}  # lineage/ancestry/size picks
    background_code: str

    class_entries: List[ClassEntryDTO]
    # ``ability_scores`` is the FINAL value per ability (base + origin bonus
    # baked in). Runtime callers use this directly for modifier math.
    # ``origin_ability_bonuses`` is the bonus dict so the wizard can subtract
    # to find what the player rolled / picked.
    ability_scores: Dict[AbilityCode, int]
    origin_ability_bonuses: Dict[AbilityCode, int] = {}
    save_proficiencies: List[AbilityCode]
    skills: List[SkillProficiencyDTO]
    feats: List[FeatAcquisitionDTO]
    spells: List[SpellSelectionDTO] = []
    resource_usage: List[ResourceUsageDTO] = []

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

    # Provenance for the ability_scores step — lets the wizard restore the
    # mode the player last used (and the dice they rolled, if applicable)
    # on resume or hard refresh.
    ability_score_method: Optional[AbilityScoreMethod] = None
    ability_roll_details: Optional[Dict[str, Any]] = None

    display_name: str
    derived: DerivedStats

    # Presigned GET URL for the uploaded avatar — short-lived. ``None`` ⇒
    # frontend renders the /heroes.png default.
    avatar_url: Optional[str] = None

    created_at: datetime
    updated_at: datetime


# --------------------------------------------------------------------------- #
# Avatar — references a library MediaAsset (asset_type='image')
# --------------------------------------------------------------------------- #


class SetAvatarRequest(BaseModel):
    """Body for PATCH /characters/{id}/avatar — null clears the avatar."""
    asset_id: Optional[UUID] = Field(
        default=None,
        description="MediaAsset.id of an existing image asset, or null to clear",
    )


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
    sub_choices: Dict[str, List[str]] = Field(default_factory=dict)  # lineage/ancestry/size picks


class ClassPick(BaseModel):
    class_code: str = Field(pattern=CodePattern)
    level: int = Field(ge=1, le=20)
    is_primary: bool = False
    chosen_skills: List[str] = Field(default_factory=list)
    sub_choices: Dict[str, List[str]] = Field(default_factory=dict)  # L1 feature-choice picks


class ClassStepPayload(BaseModel):
    classes: List[ClassPick] = Field(min_length=1, max_length=3)


class BackgroundAbilityIncrease(BaseModel):
    ability: AbilityCode
    increase: int = Field(ge=1, le=2)


class BackgroundStepPayload(BaseModel):
    background_code: str = Field(pattern=CodePattern)
    ability_increases: List[BackgroundAbilityIncrease] = Field(min_length=2, max_length=3)


class AbilityRollDetail(BaseModel):
    """Per-ability breakdown of a 4d6-drop-lowest result.

    Stored alongside the score so the wizard can re-display the dice on resume.
    """
    total: int = Field(ge=1, le=24)
    rolls: List[int] = Field(min_length=3, max_length=4)
    kept: List[int] = Field(min_length=3, max_length=3)
    dropped: int = Field(ge=1, le=6)


class AbilityScoresStepPayload(BaseModel):
    strength: int = Field(ge=1, le=20)
    dexterity: int = Field(ge=1, le=20)
    constitution: int = Field(ge=1, le=20)
    intelligence: int = Field(ge=1, le=20)
    wisdom: int = Field(ge=1, le=20)
    charisma: int = Field(ge=1, le=20)
    # Provenance — which mode the player used to arrive at these scores.
    # Optional for backward compat with older clients; the wizard always sends it.
    method: Optional[AbilityScoreMethod] = None
    # Per-ability 4d6 breakdown — only meaningful when ``method == 'rolled'``.
    roll_details: Optional[Dict[AbilityCode, AbilityRollDetail]] = None


class HpAcStepPayload(BaseModel):
    hp_max: int = Field(ge=1)
    ac: int = Field(ge=1, le=50)


class RenameStepPayload(BaseModel):
    """Name-only update from the persistent name input in the wizard header."""
    name: str = Field(min_length=1, max_length=50)


class ClassSpellSelection(BaseModel):
    """The cantrip + leveled-spell codes a player picked for one spellcasting class.

    Codes are flat (cantrips and leveled spells together); the backend resolves each spell's
    level + source via the registry, so the client doesn't have to. Counts are NOT enforced
    here — the wizard shows the class limits as guidance (facilitate, don't enforce).
    """
    class_code: str = Field(pattern=CodePattern)
    spell_codes: List[str] = Field(default_factory=list)


class SpellsStepPayload(BaseModel):
    selections: List[ClassSpellSelection] = Field(default_factory=list)


StepName = Literal[
    "identity", "class", "background", "ability_scores", "hp_ac", "spells", "rename"
]


class UpdateDraftRequest(BaseModel):
    step: StepName
    identity: Optional[IdentityStepPayload] = None
    class_: Optional[ClassStepPayload] = Field(default=None, alias="class")
    background: Optional[BackgroundStepPayload] = None
    ability_scores: Optional[AbilityScoresStepPayload] = None
    hp_ac: Optional[HpAcStepPayload] = None
    spells: Optional[SpellsStepPayload] = None
    rename: Optional[RenameStepPayload] = None

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
    # Whole-list replacement of resource-pool spent counts (rage, sorcery points, …).
    resource_usage: Optional[List[ResourceUsageDTO]] = None


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
    qualifying_feats: List[str]  # feat codes whose prerequisites the character meets
    # Remaining feats (prereqs not met or not yet verifiable). Surfaced, never hidden —
    # the modal shows these behind a "show anyway" affordance (core/product-principles.md §3.0).
    other_feats: List[str] = []


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
