# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from modules.characters.model.character_model import Character as CharacterModel
from modules.characters.domain.character_aggregate import CharacterAggregate


class CharacterRepository:
    """Repository handling Character aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id, is_deleted=False)
            .first()
        )
        if not model:
            return None

        return CharacterAggregate(
            id=model.id,
            user_id=model.user_id,
            character_name=model.character_name,
            character_class=model.character_class,
            character_race=model.character_race,
            level=model.level,
            stats=model.stats,
            created_at=model.created_at,
            updated_at=model.updated_at,
            is_deleted=model.is_deleted
        )

    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a specific user"""
        models = (
            self.db.query(CharacterModel)
            .filter_by(user_id=user_id, is_deleted=False)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [
            CharacterAggregate(
                id=model.id,
                user_id=model.user_id,
                character_name=model.character_name,
                character_class=model.character_class,
                character_race=model.character_race,
                level=model.level,
                stats=model.stats,
                created_at=model.created_at,
                updated_at=model.updated_at,
                is_deleted=model.is_deleted
            )
            for model in models
        ]

    def save(self, aggregate: CharacterAggregate) -> UUID:
        """Save character aggregate"""
        if aggregate.id:
            # Update existing character
            character_model = (
                self.db.query(CharacterModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not character_model:
                raise ValueError(f"Character {aggregate.id} not found")

            character_model.user_id = aggregate.user_id
            character_model.character_name = aggregate.character_name
            character_model.character_class = aggregate.character_class
            character_model.character_race = aggregate.character_race
            character_model.level = aggregate.level
            character_model.stats = aggregate.stats
            character_model.is_deleted = aggregate.is_deleted

        else:
            # Create new character
            character_model = CharacterModel(
                user_id=aggregate.user_id,
                character_name=aggregate.character_name,
                character_class=aggregate.character_class,
                character_race=aggregate.character_race,
                level=aggregate.level,
                stats=aggregate.stats,
                is_deleted=aggregate.is_deleted,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
            )
            self.db.add(character_model)

            # Flush to get the ID before committing
            self.db.flush()
            aggregate.id = character_model.id

        self.db.commit()
        self.db.refresh(character_model)
        return character_model.id

    def delete(self, character_id: UUID) -> bool:
        """Soft delete character"""
        character_model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id)
            .first()
        )

        if not character_model:
            return False

        # Convert to aggregate for business rule validation
        character = CharacterAggregate(
            id=character_model.id,
            user_id=character_model.user_id,
            character_name=character_model.character_name,
            character_class=character_model.character_class,
            character_race=character_model.character_race,
            level=character_model.level,
            stats=character_model.stats,
            created_at=character_model.created_at,
            updated_at=character_model.updated_at,
            is_deleted=character_model.is_deleted
        )

        if not character.can_be_deleted():
            raise ValueError("Cannot delete character - it may be in an active game")

        # Soft delete
        character.soft_delete()
        character_model.is_deleted = character.is_deleted
        self.db.commit()
        return True

