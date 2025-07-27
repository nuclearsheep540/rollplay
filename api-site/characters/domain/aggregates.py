# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID, uuid4


class CharacterAggregate:
    """Character aggregate root - represents a player character in the game"""
    
    def __init__(
        self,
        id: Optional[UUID] = None,
        user_id: Optional[UUID] = None,
        name: Optional[str] = None,
        character_class: Optional[str] = None,
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
        self.level = level
        self.stats = stats or {}
        self.created_at = created_at
        self.updated_at = updated_at
        self.is_deleted = is_deleted
    
    @classmethod
    def create(cls, user_id: UUID, name: str, character_class: str, level: int = 1, stats: Optional[Dict[str, Any]] = None):
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
        
        normalized_class = character_class.strip()
        if len(normalized_class) > 30:
            raise ValueError("Character class too long (max 30 characters)")
        
        # Business rule: Level must be valid
        if level < 1 or level > 20:
            raise ValueError("Character level must be between 1 and 20")
        
        # Business rule: Must belong to a user
        if not user_id:
            raise ValueError("Character must belong to a user")
        
        now = datetime.utcnow()
        return cls(
            id=None,  # Will be set by repository
            user_id=user_id,
            name=normalized_name,
            character_class=normalized_class,
            level=level,
            stats=stats or {},
            created_at=now,
            updated_at=now,
            is_deleted=False
        )
    
    def update_details(self, name: Optional[str] = None, character_class: Optional[str] = None, level: Optional[int] = None):
        """Update character details with business rules"""
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Character name cannot be empty")
            if len(normalized_name) > 50:
                raise ValueError("Character name too long (max 50 characters)")
            self.name = normalized_name
        
        if character_class is not None:
            normalized_class = character_class.strip()
            if not normalized_class:
                raise ValueError("Character class cannot be empty")
            if len(normalized_class) > 30:
                raise ValueError("Character class too long (max 30 characters)")
            self.character_class = normalized_class
        
        if level is not None:
            if level < 1 or level > 20:
                raise ValueError("Character level must be between 1 and 20")
            self.level = level
        
        # self.update_timestamp()  # Removed to match database schema
    
    def update_stats(self, stats: Dict[str, Any]):
        """Update character stats/sheet data"""
        if not isinstance(stats, dict):
            raise ValueError("Stats must be a dictionary")
        
        # Business rule: Validate stats structure (basic validation)
        # More complex validation could be added based on game rules
        self.stats = stats
        # self.update_timestamp()  # Removed to match database schema
    
    def level_up(self):
        """Level up the character"""
        if self.level >= 20:
            raise ValueError("Character is already at maximum level (20)")
        
        self.level += 1
        # self.update_timestamp()  # Removed to match database schema
    
    def level_down(self):
        """Level down the character (for corrections)"""
        if self.level <= 1:
            raise ValueError("Character is already at minimum level (1)")
        
        self.level -= 1
        # self.update_timestamp()  # Removed to match database schema
    
    # def update_timestamp(self):
    #     """Update the last modified timestamp"""
    #     self.updated_at = datetime.utcnow()  # Removed to match database schema
    
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