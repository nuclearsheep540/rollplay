# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID


class CharacterRaces:
    """Character race options"""
    # TODO: enumerate race options


class CharacterClasses:
    """Character class options"""
    # TODO: enumerate class options


@dataclass
class CharacterAggregate:
    """
    Character aggregate root - represents a player character in the game.

    Characters are created by users and represent their in-game personas.
    """
    id: Optional[UUID]
    user_id: UUID
    name: str
    character_class: str
    character_race: str
    level: int
    stats: Dict[str, Any]
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False

    @classmethod
    def create(
        cls,
        user_id: UUID,
        name: str,
        character_class: str,
        character_race: str,
        level: int = 1,
        stats: Optional[Dict[str, Any]] = None
    ) -> 'CharacterAggregate':
        """
        Create new character with business rules validation.

        Business Rules:
        - Character name must be provided and valid
        - Character name max 50 characters
        - Character class must be provided
        - Character race must be provided
        - Level must be between 1 and 20
        - Must belong to a user
        """
        # Business rule: Character name must be provided and valid
        if not name or not name.strip():
            raise ValueError("Character name is required")

        normalized_name = name.strip()
        if len(normalized_name) > 50:
            raise ValueError("Character name too long (max 50 characters)")

        # Business rule: Character class must be provided
        if not character_class or not character_class.strip():
            raise ValueError("Character class is required")

        # Business rule: Character race must be provided
        if not character_race:
            raise ValueError("Character race is required")

        # Business rule: Level must be valid
        if level < 1 or level > 20:
            raise ValueError("Character level must be between 1 and 20")

        # Business rule: Must belong to a user
        if not user_id:
            raise ValueError("Character must belong to a user")

        now = datetime.now()
        return cls(
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

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if character is owned by specific user"""
        return self.user_id == user_id

    def soft_delete(self):
        """Soft delete the character"""
        self.is_deleted = True

    def restore(self):
        """Restore a soft-deleted character"""
        self.is_deleted = False

    def can_be_deleted(self) -> bool:
        """
        Business rule: Characters can be deleted if not in active games.

        Note: This would need to check for active game participation.
        For now, always allow deletion (business rules can be added later).
        """
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
