# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional, Dict, Any
from uuid import UUID

from characters.adapters.repositories import CharacterRepository
from characters.domain.aggregates import CharacterAggregate


class CreateCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(
        self, 
        user_id: UUID, 
        name: str, 
        character_class: str, 
        level: int = 1,
        stats: Optional[Dict[str, Any]] = None
    ) -> CharacterAggregate:
        """Create a new character"""
        # Business rule: Character name must be unique per user
        existing_character = self.repository.get_by_name(user_id, name)
        if existing_character:
            raise ValueError(f"Character named '{name}' already exists for this user")
        
        character = CharacterAggregate.create(
            user_id=user_id,
            name=name,
            character_class=character_class,
            level=level,
            stats=stats
        )
        
        self.repository.save(character)
        return character


class GetUserCharacters:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a user"""
        return self.repository.get_by_user_id(user_id)


class GetCharacterById:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        return self.repository.get_by_id(character_id)


class UpdateCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(
        self, 
        character_id: UUID, 
        user_id: UUID,
        name: Optional[str] = None, 
        character_class: Optional[str] = None,
        level: Optional[int] = None
    ) -> CharacterAggregate:
        """Update character details"""
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")
        
        # Business rule: Only character owner can update
        if not character.is_owned_by(user_id):
            raise ValueError("Only the character owner can update this character")
        
        # Business rule: Character name must be unique per user (if changing name)
        if name and name != character.name:
            existing_character = self.repository.get_by_name(user_id, name)
            if existing_character:
                raise ValueError(f"Character named '{name}' already exists for this user")
        
        character.update_details(name=name, character_class=character_class, level=level)
        self.repository.save(character)
        return character


class UpdateCharacterStats:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(
        self, 
        character_id: UUID, 
        user_id: UUID,
        stats: Dict[str, Any]
    ) -> CharacterAggregate:
        """Update character stats/sheet data"""
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")
        
        # Business rule: Only character owner can update stats
        if not character.is_owned_by(user_id):
            raise ValueError("Only the character owner can update this character")
        
        character.update_stats(stats)
        self.repository.save(character)
        return character


class LevelUpCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, character_id: UUID, user_id: UUID) -> CharacterAggregate:
        """Level up a character"""
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")
        
        # Business rule: Only character owner can level up
        if not character.is_owned_by(user_id):
            raise ValueError("Only the character owner can level up this character")
        
        character.level_up()
        self.repository.save(character)
        return character


class LevelDownCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, character_id: UUID, user_id: UUID) -> CharacterAggregate:
        """Level down a character (for corrections)"""
        character = self.repository.get_by_id(character_id)
        if not character:
            raise ValueError(f"Character {character_id} not found")
        
        # Business rule: Only character owner can level down
        if not character.is_owned_by(user_id):
            raise ValueError("Only the character owner can level down this character")
        
        character.level_down()
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


class RestoreCharacter:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, character_id: UUID, user_id: UUID) -> bool:
        """Restore a soft-deleted character"""
        # Get deleted characters to verify ownership
        deleted_characters = self.repository.get_deleted_by_user_id(user_id)
        character_to_restore = next(
            (char for char in deleted_characters if char.id == character_id), 
            None
        )
        
        if not character_to_restore:
            raise ValueError("Character not found or not owned by user")
        
        return self.repository.restore(character_id)


class GetDeletedCharacters:
    def __init__(self, repository: CharacterRepository):
        self.repository = repository
    
    def execute(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all soft-deleted characters for a user"""
        return self.repository.get_deleted_by_user_id(user_id)