# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character resource endpoints — draft lifecycle, runtime edits, level-up.

Reference-data endpoints (editions, classes, species, backgrounds, feats,
skills) live in edition_endpoints.py.
"""

from typing import List, Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from modules.characters.api.schemas import (
    AsiChoice,
    CharacterResponse,
    CreateDraftRequest,
    DerivedSaveModifier,
    DerivedSkillModifier,
    DerivedStats,
    FeatChoice,
    LevelUpPreview,
    LevelUpRequest,
    RuntimePatchRequest,
    UpdateDraftRequest,
)
from modules.characters.application.commands import (
    CreateCharacterDraft,
    DeleteCharacter,
    DiscardCharacterDraft,
    FinalizeCharacterDraft,
    LevelUpCharacter,
    UpdateCharacterDraft,
    UpdateRuntimeState,
)
from modules.characters.application.queries import (
    GetCharacterById,
    GetCharactersByUser,
)
from modules.characters.dependencies.providers import (
    get_character_repository,
    get_edition_repository,
    get_ruleset_registry,
)
from modules.characters.domain.character_aggregate import (
    ABILITY_CODES,
    CharacterAggregate,
)
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.repositories.edition_repository import EditionRepository
from shared.dependencies.auth import get_current_user_id
from shared.rulesets.registry import RulesetRegistry


router = APIRouter()


# --------------------------------------------------------------------------- #
# Response building
# --------------------------------------------------------------------------- #


def _build_derived_stats(
    character: CharacterAggregate, registry: RulesetRegistry
) -> DerivedStats:
    ruleset = registry.get_ruleset(character.edition_code)
    skill_defs = registry.list_skills(character.edition_code)
    proficient_skill_codes = {s.skill_code: s for s in character.skills}
    skills = [
        DerivedSkillModifier(
            skill_code=s.code,
            ability=s.ability,
            proficient=s.code in proficient_skill_codes,
            expertise=(
                proficient_skill_codes[s.code].expertise
                if s.code in proficient_skill_codes
                else False
            ),
            modifier=ruleset.compute_skill_modifier(character, s.code),
        )
        for s in skill_defs
    ]
    saves = [
        DerivedSaveModifier(
            ability=ab,
            proficient=ab in character.save_proficiencies,
            modifier=ruleset.compute_save_modifier(character, ab),
        )
        for ab in ABILITY_CODES
    ]
    try:
        next_xp = ruleset.xp_for_level(character.level + 1) if character.level < 20 else None
    except ValueError:
        next_xp = None
    return DerivedStats(
        proficiency_bonus=ruleset.proficiency_bonus(character.level),
        initiative=ruleset.compute_initiative(character),
        saves=saves,
        skills=skills,
        next_level_xp=next_xp,
        pending_level_up=character.can_level_up(ruleset),
        pending_asi_count=ruleset.pending_asi_count(character),
    )


def _to_character_response(
    character: CharacterAggregate, registry: RulesetRegistry
) -> CharacterResponse:
    """Compose the full sheet response, joining stored state with ruleset-derived values."""
    derived = _build_derived_stats(character, registry)
    return CharacterResponse(
        id=character.id,
        user_id=character.user_id,
        edition_id=character.edition_id,
        edition_code=character.edition_code,
        active_campaign=character.active_campaign,
        character_name=character.character_name,
        species_code=character.species_code,
        background_code=character.background_code,
        class_entries=[
            {
                "class_code": e.class_code,
                "level": e.level,
                "is_primary": e.is_primary,
            }
            for e in character.class_entries
        ],
        # API exposes FINAL scores (base + origin bonus). Wizard subtracts
        # origin_ability_bonuses when it needs the editable base.
        ability_scores=character.final_ability_scores_dict(),
        origin_ability_bonuses=dict(character.origin_ability_bonuses or {}),
        save_proficiencies=sorted(character.save_proficiencies),
        skills=[
            {
                "skill_code": s.skill_code,
                "source": s.source,
                "expertise": s.expertise,
            }
            for s in character.skills
        ],
        feats=[
            {"feat_code": f.feat_code, "level": f.level, "source": f.source}
            for f in character.feats
        ],
        level=character.level,
        xp=character.xp,
        hp_max=character.hp_max,
        hp_current=character.hp_current,
        hp_temp=character.hp_temp,
        ac=character.ac,
        death_save_successes=character.death_save_successes,
        death_save_failures=character.death_save_failures,
        inspiration=character.inspiration,
        status_effects=list(character.status_effects),
        is_alive=character.is_alive,
        speed=character.speed,
        size=character.size,
        languages=list(character.languages),
        is_draft=character.is_draft,
        creation_step=character.creation_step,
        display_name=character.get_display_name(),
        derived=derived,
        created_at=character.created_at,
        updated_at=character.updated_at,
    )


def _http(exc: Exception) -> HTTPException:
    """Map domain exceptions to HTTP status codes."""
    if isinstance(exc, PermissionError):
        return HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))


# --------------------------------------------------------------------------- #
# Listing
# --------------------------------------------------------------------------- #


@router.get("/me", response_model=List[CharacterResponse])
async def list_my_characters(
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    """Every character (draft or finalised) owned by the current user."""
    characters = GetCharactersByUser(character_repo).execute(user_id)
    return [_to_character_response(c, registry) for c in characters]


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    character = GetCharacterById(character_repo).execute(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    # Owners always see; party members see finalised characters via the party endpoint.
    if not character.is_owned_by(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can view this character directly",
        )
    return _to_character_response(character, registry)


# --------------------------------------------------------------------------- #
# Draft lifecycle
# --------------------------------------------------------------------------- #


@router.post("/draft", response_model=CharacterResponse, status_code=status.HTTP_201_CREATED)
async def create_draft(
    request: CreateDraftRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    edition_repo: EditionRepository = Depends(get_edition_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    try:
        command = CreateCharacterDraft(character_repo, edition_repo, registry)
        character = command.execute(
            user_id=user_id, edition_code=request.edition_code, name=request.name
        )
        return _to_character_response(character, registry)
    except (ValueError, KeyError) as exc:
        raise _http(exc)


@router.patch("/draft/{character_id}", response_model=CharacterResponse)
async def update_draft(
    character_id: UUID,
    request: UpdateDraftRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    # Pick the payload that matches the declared step. The schema enforces shape;
    # the command enforces semantics (codes exist, picks match offered options).
    payload_map = {
        "identity": request.identity,
        "class": request.class_,
        "background": request.background,
        "ability_scores": request.ability_scores,
        "hp_ac": request.hp_ac,
    }
    payload_model = payload_map.get(request.step)
    if payload_model is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"step='{request.step}' but no matching payload provided",
        )
    try:
        command = UpdateCharacterDraft(character_repo, registry)
        character = command.execute(
            character_id=character_id,
            user_id=user_id,
            step=request.step,
            payload=payload_model.model_dump(by_alias=True),
        )
        return _to_character_response(character, registry)
    except (ValueError, KeyError, PermissionError) as exc:
        raise _http(exc)


@router.post("/draft/{character_id}/finalize", response_model=CharacterResponse)
async def finalize_draft(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    try:
        command = FinalizeCharacterDraft(character_repo)
        character = command.execute(character_id=character_id, user_id=user_id)
        return _to_character_response(character, registry)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.delete("/draft/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def discard_draft(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
):
    try:
        success = DiscardCharacterDraft(character_repo).execute(
            character_id=character_id, user_id=user_id
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Draft not found"
            )
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


@router.delete("/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
):
    """Soft-delete a finalised character. Drafts go through /draft/{id}.

    Refuses while the character is locked to a campaign — owner must release
    via the campaign endpoint first.
    """
    try:
        success = DeleteCharacter(character_repo).execute(
            character_id=character_id, user_id=user_id
        )
        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Character not found"
            )
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


# --------------------------------------------------------------------------- #
# Runtime
# --------------------------------------------------------------------------- #


@router.patch("/{character_id}/runtime", response_model=CharacterResponse)
async def update_runtime(
    character_id: UUID,
    request: RuntimePatchRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    updates = request.model_dump(exclude_unset=True)
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No runtime fields provided in request body",
        )
    try:
        command = UpdateRuntimeState(character_repo)
        character = command.execute(
            character_id=character_id, user_id=user_id, updates=updates
        )
        return _to_character_response(character, registry)
    except (ValueError, PermissionError) as exc:
        raise _http(exc)


# --------------------------------------------------------------------------- #
# Level-up
# --------------------------------------------------------------------------- #


@router.get("/{character_id}/level-up", response_model=LevelUpPreview)
async def preview_level_up(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    character = GetCharacterById(character_repo).execute(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    if not character.is_owned_by(user_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the owner can preview level-up",
        )
    ruleset = registry.get_ruleset(character.edition_code)

    available_classes = [e.class_code for e in character.class_entries]
    is_asi_level = {}
    hp_options = {}
    for entry in character.class_entries:
        next_class_level = entry.level + 1
        if next_class_level > 20:
            continue
        is_asi_level[entry.class_code] = (
            next_class_level in ruleset.asi_levels_for_class(entry.class_code)
        )
        hp_options[entry.class_code] = ruleset.level_up_hp_options(character, entry.class_code)

    # Feats the character qualifies for — Phase 2 returns the full list of
    # General / Fighting Style / Epic Boon feats from the registry and lets the
    # frontend display them. Strict prereq filtering is a Phase 4 polish.
    qualifying_feats = [
        f.code for f in registry.list_feats(character.edition_code)
        if f.category in {"general", "fighting_style", "epic_boon"}
    ]

    return LevelUpPreview(
        current_level=character.level,
        target_level=min(character.level + 1, 20),
        available_classes=available_classes,
        is_asi_level=is_asi_level,
        hp_options=hp_options,
        qualifying_feats=qualifying_feats,
    )


@router.post("/{character_id}/level-up", response_model=CharacterResponse)
async def apply_level_up(
    character_id: UUID,
    request: LevelUpRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    try:
        command = LevelUpCharacter(character_repo, registry)
        character = command.execute(
            character_id=character_id,
            user_id=user_id,
            class_code=request.class_code,
            hp_choice=request.hp_choice,
            roll_value=request.roll_value,
            asi_choice=request.asi_choice.model_dump() if request.asi_choice else None,
            feat_choice=request.feat_choice.model_dump() if request.feat_choice else None,
            skill_choices=request.skill_choices,
        )
        return _to_character_response(character, registry)
    except (ValueError, KeyError, PermissionError) as exc:
        raise _http(exc)
