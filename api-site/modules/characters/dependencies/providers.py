# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session
from shared.dependencies.db import get_db
from shared.rulesets.registry import RulesetRegistry
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.repositories.edition_repository import EditionRepository


def get_character_repository(db: Session = Depends(get_db)) -> CharacterRepository:
    return CharacterRepository(db)


def get_edition_repository(db: Session = Depends(get_db)) -> EditionRepository:
    return EditionRepository(db)


def get_ruleset_registry() -> RulesetRegistry:
    """Resolve the in-memory ruleset registry initialised in main.py's lifespan."""
    return RulesetRegistry.get_instance()
