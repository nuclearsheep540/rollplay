# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional, Dict, Any
from uuid import UUID

from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import CharacterAggregate


class CreateCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        user_id: UUID,
        character_name: str,
        character_class: str,
        character_race: str,
        level: int = 1,
        stats: Optional[Dict[str, Any]] = None
    ) -> CharacterAggregate:
        """Create a new character"""
        character = CharacterAggregate.create(
            user_id=user_id,
            character_name=character_name,
            character_class=character_class,
            character_race=character_race,
            level=level,
            stats=stats
        )

        self.repository.save(character)
        return character


class DeleteCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, character_id: UUID, user_id: UUID) -> bool:
        """Delete character (soft delete)"""
        character = self.repository.get_by_id(character_id)
        if not character:
            return False

        # Business rule: Only character owner can delete
        if not character.is_owned_by(user_id):
            raise ValueError("Only the character owner can delete this character")

        # Business rule: Check if character can be deleted
        if not character.can_be_deleted():
            raise ValueError("Cannot delete character - it may be in an active game")

        return self.repository.delete(character_id)
