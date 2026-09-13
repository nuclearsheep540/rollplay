# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import Depends
from sqlalchemy.orm import Session

from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.repositories.edition_repository import EditionRepository
from shared.dependencies.db import get_db
from shared.rulesets.registry import RulesetRegistry


def get_character_repository(db: Session = Depends(get_db)) -> CharacterRepository:
    return CharacterRepository(db)


def get_edition_repository(db: Session = Depends(get_db)) -> EditionRepository:
    """The editions table backs the dormant ruleset content that will become the framework
    preset; nothing character-shaped reads it."""
    return EditionRepository(db)


def get_ruleset_registry() -> RulesetRegistry:
    """Resolve the in-memory ruleset registry initialised in main.py's lifespan.

    Dormant as far as characters are concerned — it backs the edition endpoints that will
    become the framework preset.
    """
    return RulesetRegistry.get_instance()
