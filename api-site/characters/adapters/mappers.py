# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional
from characters.orm.character_model import Character as CharacterModel
from characters.domain.aggregates import CharacterAggregate


def to_domain(model: CharacterModel) -> Optional[CharacterAggregate]:
    """Convert Character ORM model to domain aggregate"""
    if not model:
        return None
    
    return CharacterAggregate(
        id=model.id,
        user_id=model.user_id,
        name=model.name,
        character_class=model.character_class,
        level=model.level,
        stats=model.stats,
        created_at=model.created_at,
        updated_at=model.updated_at,
        is_deleted=model.is_deleted
    )


def from_domain(aggregate: CharacterAggregate) -> CharacterModel:
    """Convert Character domain aggregate to ORM model"""
    return CharacterModel(
        id=aggregate.id,
        user_id=aggregate.user_id,
        name=aggregate.name,
        character_class=aggregate.character_class,
        level=aggregate.level,
        stats=aggregate.stats,
        created_at=aggregate.created_at,
        updated_at=aggregate.updated_at,
        is_deleted=aggregate.is_deleted
    )


def update_model_from_domain(model: CharacterModel, aggregate: CharacterAggregate):
    """Update Character ORM model from domain aggregate"""
    model.name = aggregate.name
    model.character_class = aggregate.character_class
    model.level = aggregate.level
    model.stats = aggregate.stats
    model.updated_at = aggregate.updated_at
    model.is_deleted = aggregate.is_deleted
    # Note: user_id, id, and created_at are immutable after creation