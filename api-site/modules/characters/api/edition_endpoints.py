# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Reference-data endpoints — list editions + per-edition class/species/etc.

Response shapes are the Pydantic models from shared.rulesets.models —
no DTO mirroring (per the project's schemas convention).
"""

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from modules.characters.api.schemas import EditionResponse
from modules.characters.dependencies.providers import (
    get_edition_repository,
    get_ruleset_registry,
)
from modules.characters.repositories.edition_repository import EditionRepository
from shared.rulesets.models import (
    BackgroundDefinition,
    ClassDefinition,
    FeatDefinition,
    SkillDefinition,
    SpeciesDefinition,
    SpellDefinition,
)
from shared.rulesets.registry import RulesetRegistry


router = APIRouter()


@router.get("", response_model=List[EditionResponse])
async def list_editions(
    edition_repo: EditionRepository = Depends(get_edition_repository),
):
    """Every active ruleset edition. Always at least one row (the seed)."""
    rows = edition_repo.list_active()
    return [EditionResponse.model_validate(row) for row in rows]


def _ensure_known(registry: RulesetRegistry, edition_code: str) -> None:
    if edition_code not in registry.list_editions():
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Unknown edition '{edition_code}'",
        )


@router.get("/{edition_code}/classes", response_model=List[ClassDefinition])
async def list_classes(
    edition_code: str,
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_classes(edition_code)


@router.get("/{edition_code}/species", response_model=List[SpeciesDefinition])
async def list_species(
    edition_code: str,
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_species(edition_code)


@router.get("/{edition_code}/backgrounds", response_model=List[BackgroundDefinition])
async def list_backgrounds(
    edition_code: str,
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_backgrounds(edition_code)


@router.get("/{edition_code}/feats", response_model=List[FeatDefinition])
async def list_feats(
    edition_code: str,
    category: Optional[str] = Query(
        default=None,
        pattern="^(origin|general|fighting_style|epic_boon)$",
    ),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_feats(edition_code, category=category)


@router.get("/{edition_code}/skills", response_model=List[SkillDefinition])
async def list_skills(
    edition_code: str,
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_skills(edition_code)


@router.get("/{edition_code}/spells", response_model=List[SpellDefinition])
async def list_spells(
    edition_code: str,
    class_code: Optional[str] = Query(default=None, pattern=r"^[a-z0-9_]+$"),
    level: Optional[int] = Query(default=None, ge=0, le=9),
    registry: RulesetRegistry = Depends(get_ruleset_registry),
):
    _ensure_known(registry, edition_code)
    return registry.list_spells(edition_code, class_code=class_code, level=level)
