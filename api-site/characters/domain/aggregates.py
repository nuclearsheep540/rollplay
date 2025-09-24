# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID, uuid4

class CharacterRaces:
    """"""
    #TODO: enumerate race options

class CharacterClasses:
    """"""
    #TODO: enumerate class options

class CharacterAggregate:
    """Character aggregate root - represents a player character in the game"""
    
    def __init__(
        self,
        id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        name: Optional[str] = None,
        character_class: Optional[str] = "",
        character_race: Optional[str] = "",
        level: int = 1,
        stats: Optional[Dict[str, Any]] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        is_deleted: bool = False
    ):
        self.id = id
        self.user_id = user_id
        self.name = name
        self.character_class = character_class
        self.character_race = character_race
        self.level = level
        self.stats = stats or {}
        self.created_at = created_at
        self.updated_at = updated_at
        self.is_deleted = is_deleted
    
    @classmethod
    def create(
        cls,
        user_id: UUID,
        name: str,
        character_class: str,
        character_race: str,
        level: int = 1,
        stats: Optional[Dict[str, Any]] = None): #TODO: str, char, wiz etc..
        """Create new character with business rules validation"""
        # Business rule: Character name must be provided and valid
        if not name or not name.strip():
            raise ValueError("Character name is required")
        
        normalized_name = name.strip()
        if len(normalized_name) > 50:
            raise ValueError("Character name too long (max 50 characters)")
        
        # Business rule: Character class must be provided
        if not character_class or not character_class.strip():
            raise ValueError("Character class is required")
           
        if not character_race:
            raise ValueError("Character race is required")

        # Business rule: Level must be valid
        if level < 1 or level > 20:
            raise ValueError("Character level must be between 1 and 20")
        
        # Business rule: Must belong to a user
        if not user_id:
            raise ValueError("Character must belong to a user")
        
        
        now = datetime.now()
        new_character = cls(
            id=None,  # Will be set by repository
            user_id=user_id,
            name=normalized_name,
            character_class=character_class,
            character_race=character_race,
            level=level,
            stats=stats or {},
            created_at=now,
            updated_at=now,
            is_deleted=False
        )
        return new_character
    
    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if character is owned by specific user"""
        return self.user_id == user_id
    
    def soft_delete(self):
        """Soft delete the character"""
        self.is_deleted = True
        # self.update_timestamp()  # Removed to match database schema
    
    def restore(self):
        """Restore a soft-deleted character"""
        self.is_deleted = False
        # self.update_timestamp()  # Removed to match database schema
    
    def can_be_deleted(self) -> bool:
        """Business rule: Characters can be deleted if not in active games"""
        # Note: This would need to check for active game participation
        # For now, always allow deletion (business rules can be added later)
        return True
    
    def get_display_name(self) -> str:
        """Get formatted display name"""
        return f"{self.name} (Level {self.level} {self.character_class})"
    
    def get_stat(self, stat_name: str, default: Any = None) -> Any:
        """Get a specific stat value"""
        return self.stats.get(stat_name, default)
    
    def set_stat(self, stat_name: str, value: Any):
        """Set a specific stat value"""
        if not isinstance(self.stats, dict):
            self.stats = {}
        
        self.stats[stat_name] = value
        # self.update_timestamp()  # Removed to match database schema