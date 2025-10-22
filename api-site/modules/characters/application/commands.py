# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from uuid import UUID

from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import (
    CharacterAggregate,
    AbilityScores,
    CharacterRace,
    CharacterClass
)


class CreateCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        user_id: UUID,
        character_name: str,
        character_class: CharacterClass,
        character_race: CharacterRace,
        level: int = 1,
        ability_scores: Optional[AbilityScores] = None
    ) -> CharacterAggregate:
        """Create a new character"""
        character = CharacterAggregate.create(
            user_id=user_id,
            character_name=character_name,
            character_class=character_class,
            character_race=character_race,
            level=level,
            ability_scores=ability_scores,
            active_game=None
        )

        self.repository.save(character)
        return character


class UpdateAbilityScores:
    """Update character ability scores"""
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        character_id: UUID,
        user_id: UUID,
        ability_scores: AbilityScores
    ) -> CharacterAggregate:
        """Update character's ability scores (for leveling, magic items)"""
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Business rule: Only owner can update
        if not character.is_owned_by(user_id):
            raise ValueError("Only character owner can update ability scores")

        # Update via aggregate method
        character.update_ability_scores(ability_scores)

        # Save
        self.repository.save(character)
        return character


class UpdateCharacter:
    """Update existing character"""
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        character_id: UUID,
        user_id: UUID,
        character_name: str,
        character_class: CharacterClass,
        character_race: CharacterRace,
        level: int,
        ability_scores: AbilityScores
    ) -> CharacterAggregate:
        """Update an existing character with new values"""
        # Fetch existing character
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Business rule: Only owner can update
        if not character.is_owned_by(user_id):
            raise ValueError("Only character owner can update this character")

        # Update all fields
        character.character_name = character_name.strip()
        character.character_class = character_class
        character.character_race = character_race
        character.level = level
        character.ability_scores = ability_scores
        character.updated_at = datetime.now()

        # Save updated character
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
