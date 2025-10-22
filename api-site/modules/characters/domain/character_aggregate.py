# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Optional, Dict
from uuid import UUID
from enum import Enum


@dataclass(frozen=True)
class AbilityScores:
    """
    D&D 5e Ability Scores Value Object.

    Immutable, validated set of six core abilities.
    """
    strength: int
    dexterity: int
    constitution: int
    intelligence: int
    wisdom: int
    charisma: int

    def update_score(self, **kwargs) -> 'AbilityScores':
        """
        Update specified ability scores, keeping others unchanged.

        Example:
            new_scores = scores.update_score(intelligence=9, strength=16)
        """
        return replace(self, **kwargs)

    def to_dict(self) -> Dict[str, int]:
        """Serialize to dict for JSON storage in PostgreSQL"""
        return {
            "strength": self.strength,
            "dexterity": self.dexterity,
            "constitution": self.constitution,
            "intelligence": self.intelligence,
            "wisdom": self.wisdom,
            "charisma": self.charisma
        }

    @classmethod
    def from_dict(cls, data: Dict[str, int]) -> 'AbilityScores':
        """Deserialize from dict (for ORM → Domain conversion)"""
        return cls(
            strength=data.get("strength", 1),
            dexterity=data.get("dexterity", 1),
            constitution=data.get("constitution", 1),
            intelligence=data.get("intelligence", 1),
            wisdom=data.get("wisdom", 1),
            charisma=data.get("charisma", 1)
        )

    @classmethod
    def default(cls) -> 'AbilityScores':
        """Default ability scores - all set to 1"""
        return cls(
            strength=1,
            dexterity=1,
            constitution=1,
            intelligence=1,
            wisdom=1,
            charisma=1
        )


class CharacterRace(str, Enum):
    """D&D 5e Player's Handbook races"""
    HUMAN = "Human"
    ELF = "Elf"
    DWARF = "Dwarf"
    HALFLING = "Halfling"
    DRAGONBORN = "Dragonborn"
    GNOME = "Gnome"
    HALF_ELF = "Half-Elf"
    HALF_ORC = "Half-Orc"
    TIEFLING = "Tiefling"

    def __str__(self) -> str:
        return self.value


class CharacterClass(str, Enum):
    """D&D 5e Player's Handbook classes"""
    BARBARIAN = "Barbarian"
    BARD = "Bard"
    CLERIC = "Cleric"
    DRUID = "Druid"
    FIGHTER = "Fighter"
    MONK = "Monk"
    PALADIN = "Paladin"
    RANGER = "Ranger"
    ROGUE = "Rogue"
    SORCERER = "Sorcerer"
    WARLOCK = "Warlock"
    WIZARD = "Wizard"

    def __str__(self) -> str:
        return self.value


@dataclass
class CharacterAggregate:
    """
    Character aggregate root - represents a player character in the game.

    Characters are created by users and represent their in-game personas.
    """
    id: Optional[UUID]
    user_id: UUID
    character_name: str
    character_class: CharacterClass
    character_race: CharacterRace
    level: int
    ability_scores: AbilityScores
    created_at: datetime
    updated_at: datetime
    is_deleted: bool = False
    active_game: Optional[UUID] = None  # the gameID they're associated with

    @classmethod
    def create(
        cls,
        active_game: None,
        user_id: UUID,  # owner
        character_name: str,
        character_class: CharacterClass,
        character_race: CharacterRace,
        level: int = 1,
        ability_scores: Optional[AbilityScores] = None,
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
        if not character_name or not character_name.strip():
            raise ValueError("Character name is required")

        normalized_name = character_name.strip()
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

        # Default ability scores to 1 if not provided
        if not ability_scores:
            ability_scores = AbilityScores.default()

        now = datetime.now()
        return cls(
            id=None,  # Will be set by repository
            user_id=user_id,
            character_name=normalized_name,
            character_class=character_class,
            character_race=character_race,
            level=level,
            ability_scores=ability_scores,
            created_at=now,
            updated_at=now,
            is_deleted=False,
            active_game=active_game
        )

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if character is owned by specific user"""
        return self.user_id == user_id

    def soft_delete(self):
        """Soft delete the character"""
        self.is_deleted = True

    def can_be_deleted(self) -> bool:
        """
        Business rule: Characters can be deleted if not in active games.

        Note: This would need to check for active game participation.
        For now, always allow deletion (business rules can be added later).
        """
        return True

    def get_display_name(self) -> str:
        """Get formatted display name"""
        return f"{self.character_name} (Level {self.level} {self.character_class.value})"

    def update_ability_scores(self, new_scores: AbilityScores) -> None:
        """Update character's ability scores (for when user sets them via interface)"""
        self.ability_scores = new_scores
        self.updated_at = datetime.now()
    
    def join_game(self, game_id):
        """
        Joins the character to a game.id
        Characters can only join one game at a time
        """
        if self.active_game:
            return ValueError("Character is already in a game")

        self.active_game = game_id
        return game_id
    
    def leave_game(self, game_id):
        """
        Removes the character from its associated game
        """
        self.active_game = None

