# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, List, Dict
from uuid import UUID

from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.domain.character_aggregate import (
    CharacterAggregate,
    AbilityScores,
    CharacterRace,
    CharacterClass,
    CharacterClassInfo,
    CharacterBackground
)


class CreateCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(
        self,
        user_id: UUID,
        character_name: str,
        character_classes: List[CharacterClassInfo],
        character_race: CharacterRace,
        background: Optional[CharacterBackground] = None,
        level: int = 1,
        ability_scores: Optional[AbilityScores] = None,
        origin_ability_bonuses: Optional[dict] = None,
        hp_max: int = 10,
        hp_current: int = 10,
        ac: int = 10
    ) -> CharacterAggregate:
        """Create a new character with multi-class support and D&D 2024 background bonuses"""
        character = CharacterAggregate.create(
            user_id=user_id,
            character_name=character_name,
            character_classes=character_classes,  # List of classes
            character_race=character_race,
            background=background,  # D&D 2024
            level=level,
            ability_scores=ability_scores,
            origin_ability_bonuses=origin_ability_bonuses,  # D&D 2024
            active_game=None,
            hp_max=hp_max,
            hp_current=hp_current,
            ac=ac
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
        character_classes: List[CharacterClassInfo],
        character_race: CharacterRace,
        level: int,
        ability_scores: AbilityScores,
        hp_max: int,
        hp_current: int,
        ac: int,
        background: Optional[CharacterBackground] = None,
        origin_ability_bonuses: Optional[Dict[str, int]] = None,
    ) -> CharacterAggregate:
        """Update an existing character with new values (supports multi-class)"""
        # Fetch existing character
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")

        # Business rule: Only owner can update
        if not character.is_owned_by(user_id):
            raise ValueError("Only character owner can update this character")

        # Update via domain method (includes business rule validation)
        character.update_character(
            character_name=character_name,
            character_classes=character_classes,  # List of classes
            character_race=character_race,
            level=level,
            hp_max=hp_max,
            hp_current=hp_current,
            ac=ac
        )

        # Update ability scores separately (has its own method)
        character.update_ability_scores(ability_scores)

        # Update background and origin bonuses if provided
        if background is not None:
            character.background = background
        if origin_ability_bonuses is not None:
            character.origin_ability_bonuses = origin_ability_bonuses
            character._validate_origin_bonuses()  # Re-run validation

        # Save updated character
        self.repository.save(character)
        return character


class CloneCharacter:
    """Clone an existing character"""
    def __init__(self, repository: CharacterRepository):
        self.repository = repository

    def execute(self, character_id: UUID, user_id: UUID) -> CharacterAggregate:
        """Clone a character by creating a new copy with '(Copy)' appended to the name"""
        # Fetch existing character
        source_character = self.repository.get_by_id(character_id)
        if not source_character:
            raise ValueError(f"Character {character_id} not found")

        # Business rule: Only owner can clone their own characters
        if not source_character.is_owned_by(user_id):
            raise ValueError("Only character owner can clone this character")

        # Deep copy character classes to avoid shared references
        cloned_classes = [
            CharacterClassInfo(
                character_class=class_info.character_class,
                level=class_info.level
            )
            for class_info in source_character.character_classes
        ]

        # Deep copy ability scores to avoid shared references
        cloned_ability_scores = AbilityScores(
            strength=source_character.ability_scores.strength,
            dexterity=source_character.ability_scores.dexterity,
            constitution=source_character.ability_scores.constitution,
            intelligence=source_character.ability_scores.intelligence,
            wisdom=source_character.ability_scores.wisdom,
            charisma=source_character.ability_scores.charisma
        )

        # Deep copy origin bonuses dict to avoid shared references
        cloned_origin_bonuses = dict(source_character.origin_ability_bonuses) if source_character.origin_ability_bonuses else {}

        # Create new character with same data but new name
        cloned_character = CharacterAggregate.create(
            user_id=user_id,
            character_name=f"{source_character.character_name} (Copy)",
            character_classes=cloned_classes,
            character_race=source_character.character_race,
            background=source_character.background,
            level=source_character.level,
            ability_scores=cloned_ability_scores,
            origin_ability_bonuses=cloned_origin_bonuses,
            active_game=None,  # New character not in any game
            hp_max=source_character.hp_max,
            hp_current=source_character.hp_max,  # Reset to max HP
            ac=source_character.ac
        )

        # Save and return new character
        self.repository.save(cloned_character)
        return cloned_character


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
