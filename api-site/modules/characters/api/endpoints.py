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
    SetAvatarRequest,
    UpdateDraftRequest,
)
from modules.characters.application.commands import (
    CreateCharacterDraft,
    DeleteCharacter,
    DiscardCharacterDraft,
    FinalizeCharacterDraft,
    LevelUpCharacter,
    SetCharacterAvatar,
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
from modules.library.dependencies.providers import get_media_asset_repository
from modules.library.repositories.asset_repository import MediaAssetRepository
from shared.dependencies.auth import get_current_user_id
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from shared.rulesets.registry import RulesetRegistry
from shared.services.s3_service import S3Service, get_s3_service


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
    # Spellcasting — empty/null for non-casters. DC/attack are keyed by the casting ability
    # of each spellcasting class the character has (one entry at L1; more once multi-class).
    pact = ruleset.compute_pact_slots(character)
    casting_abilities = {
        ab
        for ab in (ruleset.spellcasting_ability(e.class_code) for e in character.class_entries)
        if ab is not None
    }
    # Resource pools — join the ruleset max with the stored spent count + recharge cadence.
    spent_by_pool = {r.pool_code: r.current_value for r in character.resource_usage}
    resource_pools = [
        {
            "pool_code": pool_code,
            "max_value": max_value,
            "current_value": spent_by_pool.get(pool_code, 0),
            "recharge": ruleset.resource_recharge(pool_code),
        }
        for pool_code, max_value in sorted(ruleset.compute_resource_pools(character).items())
    ]
    return DerivedStats(
        proficiency_bonus=ruleset.proficiency_bonus(character.level),
        initiative=ruleset.compute_initiative(character),
        saves=saves,
        skills=skills,
        next_level_xp=next_xp,
        pending_level_up=character.can_level_up(ruleset),
        pending_asi_count=ruleset.pending_asi_count(character),
        spell_slots=ruleset.compute_spell_slots(character),
        pact_slots=(
            {"count": pact.count, "slot_level": pact.slot_level} if pact is not None else None
        ),
        spell_save_dc_by_ability={
            ab: ruleset.compute_spell_save_dc(character, ab) for ab in casting_abilities
        },
        spell_attack_bonus_by_ability={
            ab: ruleset.compute_spell_attack_bonus(character, ab) for ab in casting_abilities
        },
        resource_pools=resource_pools,
        ac_methods=ruleset.list_ac_methods(character),
        computed_hp_max=ruleset.compute_hp_max(character),
    )


def _to_character_response(
    character: CharacterAggregate,
    registry: RulesetRegistry,
    s3_service: Optional[S3Service] = None,
) -> CharacterResponse:
    """Compose the full sheet response, joining stored state with ruleset-derived values."""
    derived = _build_derived_stats(character, registry)
    # Avatar URL — short-lived presigned GET. Null when no upload yet OR when
    # this helper is called from a context that didn't inject s3_service
    # (e.g. legacy callers); frontend treats null as "show /heroes.png".
    avatar_url: Optional[str] = None
    if character.avatar_s3_key and s3_service is not None:
        try:
            avatar_url = s3_service.generate_download_url(character.avatar_s3_key)
        except Exception:
            # Don't fail the whole sheet load over a transient S3 issue —
            # frontend falls back to the default placeholder.
            avatar_url = None
    return CharacterResponse(
        id=character.id,
        user_id=character.user_id,
        edition_id=character.edition_id,
        edition_code=character.edition_code,
        active_campaign=character.active_campaign,
        character_name=character.character_name,
        species_code=character.species_code,
        species_sub_choices=character.species_sub_choices,
        background_code=character.background_code,
        class_entries=[
            {
                "class_code": e.class_code,
                "level": e.level,
                "is_primary": e.is_primary,
                "sub_choices": e.sub_choices,
                "chosen_skills": e.chosen_skills,
            }
            for e in character.class_entries
        ],
        subclasses=[
            {
                "class_code": s.class_code,
                "subclass_code": s.subclass_code,
                "chosen_at_level": s.chosen_at_level,
            }
            for s in character.subclasses
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
        spells=[
            {
                "spell_code": s.spell_code,
                "spell_level": s.spell_level,
                "source": s.source,
                "granted_by": s.granted_by,
                "casting_ability": s.casting_ability,
            }
            for s in character.spells
        ],
        resource_usage=[
            {"pool_code": r.pool_code, "current_value": r.current_value}
            for r in character.resource_usage
        ],
        currency=dict(character.currency or {}),
        inventory=[
            {"item_code": i.item_code, "quantity": i.quantity, "notes": i.notes}
            for i in character.inventory
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
        exhaustion_level=character.exhaustion_level,
        is_alive=character.is_alive,
        speed=character.speed,
        size=character.size,
        languages=list(character.languages),
        is_draft=character.is_draft,
        creation_step=character.creation_step,
        ability_score_method=character.ability_score_method,
        ability_roll_details=character.ability_roll_details,
        display_name=character.get_display_name(),
        derived=derived,
        avatar_url=avatar_url,
        avatar_asset_id=character.avatar_asset_id,
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
    s3_service: S3Service = Depends(get_s3_service),
):
    """Every character (draft or finalised) owned by the current user."""
    characters = GetCharactersByUser(character_repo).execute(user_id)
    return [_to_character_response(c, registry, s3_service) for c in characters]


@router.get("/party/{campaign_id}", response_model=List[CharacterResponse])
async def get_campaign_party(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
):
    """DM party view (Phase H) — every character active in the campaign. Read-only. Visible to
    the campaign's DM or any of its members."""
    campaign = campaign_repo.get_by_id(campaign_id)
    if campaign is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Campaign not found")
    if not (campaign.is_dm(user_id) or campaign.is_member(user_id)):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the campaign's DM or a party member can view the party",
        )
    characters = character_repo.get_by_active_campaign(campaign_id)
    return [_to_character_response(c, registry, s3_service) for c in characters]


@router.get("/internal/{character_id}/summary")
async def character_summary(
    character_id: UUID,
    character_repo: CharacterRepository = Depends(get_character_repository),
):
    """Service-to-service snapshot for api-game's player_metadata sync (Phase I). Under the
    /internal path (mirrors /api/users/internal/*), which nginx returns 404 for — so it's reachable
    only over the private network (Docker/VPC); that isolation is the auth boundary. Returns only
    low-sensitivity fields already broadcast to session peers."""
    character = character_repo.get_by_id(character_id)
    if character is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Character not found")
    return {
        "character_id": str(character.id),
        "character_name": character.character_name,
        "character_class": [e.class_code for e in character.class_entries],
        "character_race": character.species_code,
        "level": character.level,
        "hp_current": character.hp_current,
        "hp_max": character.hp_max,
        "ac": character.ac,
        "color": character.color,
    }


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
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
    return _to_character_response(character, registry, s3_service)


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
    s3_service: S3Service = Depends(get_s3_service),
):
    try:
        command = CreateCharacterDraft(character_repo, edition_repo, registry)
        character = command.execute(
            user_id=user_id, edition_code=request.edition_code, name=request.name
        )
        return _to_character_response(character, registry, s3_service)
    except (ValueError, KeyError) as exc:
        raise _http(exc)


@router.patch("/draft/{character_id}", response_model=CharacterResponse)
async def update_draft(
    character_id: UUID,
    request: UpdateDraftRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
):
    # Pick the payload that matches the declared step. The schema enforces shape;
    # the command enforces semantics (codes exist, picks match offered options).
    payload_map = {
        "identity": request.identity,
        "class": request.class_,
        "background": request.background,
        "ability_scores": request.ability_scores,
        "hp_ac": request.hp_ac,
        "spells": request.spells,
        "advancement": request.advancement,
        "rename": request.rename,
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
        return _to_character_response(character, registry, s3_service)
    except (ValueError, KeyError, PermissionError) as exc:
        raise _http(exc)


@router.post("/draft/{character_id}/finalize", response_model=CharacterResponse)
async def finalize_draft(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
):
    try:
        command = FinalizeCharacterDraft(character_repo)
        character = command.execute(character_id=character_id, user_id=user_id)
        return _to_character_response(character, registry, s3_service)
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
# Avatar — point the character at a library MediaAsset (asset_type='image')
# --------------------------------------------------------------------------- #


@router.patch("/{character_id}/avatar", response_model=CharacterResponse)
async def set_character_avatar(
    character_id: UUID,
    request: SetAvatarRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    asset_repo: MediaAssetRepository = Depends(get_media_asset_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
):
    """Set or clear the character's avatar.

    Owner-only. ``asset_id=null`` clears the avatar; otherwise the asset must
    exist, be owned by the same user, and be image-type. The upload itself
    goes through the standard asset-library 3-step flow — this endpoint
    just links the existing asset to the character.
    """
    try:
        character = SetCharacterAvatar(character_repo, asset_repo).execute(
            character_id=character_id,
            user_id=user_id,
            asset_id=request.asset_id,
        )
        return _to_character_response(character, registry, s3_service)
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
    s3_service: S3Service = Depends(get_s3_service),
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
        return _to_character_response(character, registry, s3_service)
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
    s3_service: S3Service = Depends(get_s3_service),
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

    # Feats split into two buckets for point-of-choice guidance — NOT a hard filter.
    # `qualifying_feats` are those whose prerequisites the character meets; `other_feats`
    # are the rest. Both are returned so the UI can surface everything (guide, don't hide —
    # core/product-principles.md §3.0); the modal shows `other_feats` behind a "show anyway".
    qualifying_feats: list[str] = []
    other_feats: list[str] = []
    feat_details: dict[str, str] = {}
    for feat in registry.list_feats(character.edition_code):
        if feat.category not in {"general", "fighting_style", "epic_boon"}:
            continue
        # Bucket against the level the character is levelling INTO, not their current level, so a
        # feat gated at that next level (e.g. Ability Score Improvement at 4) reads as qualifying.
        bucket = (
            qualifying_feats
            if ruleset.is_feat_available(character, feat, at_level=character.level + 1)
            else other_feats
        )
        bucket.append(feat.code)
        feat_details[feat.code] = feat.description

    # Point-of-choice guidance (Phase D) — surfaced, never gated.
    subclass_eligible = [
        e.class_code for e in character.class_entries
        if ruleset.can_pick_subclass(character, e.class_code)
    ]
    taken = set(available_classes)
    multiclass_options = {
        c.code: ruleset.can_add_class(character, c.code)
        for c in registry.list_classes(character.edition_code)
        if c.code not in taken
    }

    # F.1: a subclass is pending for a class whose NEXT level reaches its subclass level and that
    # has no subclass chosen yet. Offer that class's subclass options.
    has_subclass = {s.class_code for s in character.subclasses}
    subclass_pending: dict[str, list[str]] = {}
    for e in character.class_entries:
        cls = registry.get_class(character.edition_code, e.class_code)
        if (
            cls.subclass_level is not None
            and e.level + 1 >= cls.subclass_level
            and e.class_code not in has_subclass
        ):
            subclass_pending[e.class_code] = [s.code for s in cls.subclasses]

    return LevelUpPreview(
        current_level=character.level,
        target_level=min(character.level + 1, 20),
        available_classes=available_classes,
        is_asi_level=is_asi_level,
        hp_options=hp_options,
        qualifying_feats=qualifying_feats,
        other_feats=other_feats,
        subclass_eligible=subclass_eligible,
        multiclass_options=multiclass_options,
        subclass_pending=subclass_pending,
        feat_details=feat_details,
    )


@router.post("/{character_id}/level-up", response_model=CharacterResponse)
async def apply_level_up(
    character_id: UUID,
    request: LevelUpRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
    s3_service: S3Service = Depends(get_s3_service),
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
            subclass_choice=request.subclass_choice.model_dump() if request.subclass_choice else None,
        )
        return _to_character_response(character, registry, s3_service)
    except (ValueError, KeyError, PermissionError) as exc:
        raise _http(exc)
