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

    Business Rule: All ability scores must be between 1 and 30.
    """
    strength: int
    dexterity: int
    constitution: int
    intelligence: int
    wisdom: int
    charisma: int

    def __post_init__(self):
        """Validate ability scores on creation"""
        scores = {
            'strength': self.strength,
            'dexterity': self.dexterity,
            'constitution': self.constitution,
            'intelligence': self.intelligence,
            'wisdom': self.wisdom,
            'charisma': self.charisma
        }
        for ability, score in scores.items():
            if not (1 <= score <= 30):
                raise ValueError(f"{ability.capitalize()} score must be between 1 and 30 (got {score})")

    def update_score(self, **kwargs) -> 'AbilityScores':
        """
        Update specified ability scores, keeping others unchanged.

        Example:
            new_scores = scores.update_score(intelligence=9, strength=16)

        Validates that all scores remain between 1 and 30.
        """
        # Validation happens automatically in __post_init__ when replace() creates new instance
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

    Locking:
    - active_game: UUID of game character is locked to (can only be in one game at a time)
    - is_alive: Whether character is alive (for D&D death mechanics)
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
    hp_max: int
    hp_current: int
    ac: int
    is_deleted: bool = False
    active_game: Optional[UUID] = None  # Game character is locked to
    is_alive: bool = True  # Character alive status (D&D death mechanics)

    @classmethod
    def create(
        cls,
        active_game: None,
        user_id: UUID,  # owner
        character_name: str,
        character_class: CharacterClass,
        character_race: CharacterRace,
        hp_max: int,
        hp_current: int,
        ac: int,
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
            active_game=None,  # New characters not locked to any game
            is_alive=True,  # New characters start alive
            hp_max=hp_max,
            hp_current=hp_current,
            ac=ac
        )

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if character is owned by specific user"""
        return self.user_id == user_id

    def soft_delete(self):
        """Soft delete the character"""
        self.is_deleted = True

    def can_be_deleted(self) -> bool:
        """
        Business rule: Characters cannot be deleted if locked to a game.
        Must leave game first to unlock character before deletion.
        """
        return self.active_game is None

    def is_locked(self) -> bool:
        """Check if character is locked to a game."""
        return self.active_game is not None

    def get_display_name(self) -> str:
        """Get formatted display name"""
        return f"{self.character_name} (Level {self.level} {self.character_class.value})"

    def update_ability_scores(self, new_scores: AbilityScores) -> None:
        """
        Update character's ability scores (for when user sets them via interface).

        Business Rule: All ability scores validated by AbilityScores value object (1-30 range).
        """
        # Validation enforced by AbilityScores.__post_init__
        self.ability_scores = new_scores
        self.updated_at = datetime.now()

    def update_character(
        self,
        character_name: Optional[str] = None,
        character_class: Optional[CharacterClass] = None,
        character_race: Optional[CharacterRace] = None,
        level: Optional[int] = None,
        hp_max: Optional[int] = None,
        hp_current: Optional[int] = None,
        ac: Optional[int] = None
    ) -> None:
        """
        Update character details with business rules validation.

        All parameters are optional - only provided fields will be updated.

        Business Rules:
        - Character name must be valid and <= 50 characters
        - Level must be between 1 and 20
        - Character class and race must be valid if provided
        """
        if character_name is not None:
            normalized_name = character_name.strip()
            if not normalized_name:
                raise ValueError("Character name cannot be empty")
            if len(normalized_name) > 50:
                raise ValueError("Character name too long (max 50 characters)")
            self.character_name = normalized_name

        if character_class is not None:
            if not character_class or not str(character_class).strip():
                raise ValueError("Character class is required")
            self.character_class = character_class

        if character_race is not None:
            if not character_race:
                raise ValueError("Character race is required")
            self.character_race = character_race

        if level is not None:
            if level < 1 or level > 20:
                raise ValueError("Character level must be between 1 and 20")
            self.level = level

        if hp_max is not None:
            self.hp_max = hp_max

        if hp_current is not None:
            # you can have temporary hitpoints so current may exceed max
            self.hp_current = hp_current

        if ac is not None:
            self.ac = ac

        self.updated_at = datetime.now()

    def lock_to_game(self, game_id: UUID) -> None:
        """
        Lock character to a specific game.
        Characters can only be locked to one game at a time.

        Business Rules:
        - Character must not already be locked
        - Dead characters can still be locked (they remain in roster)
        """
        if self.active_game is not None:
            raise ValueError(f"Character already locked to game {self.active_game}")

        self.active_game = game_id
        self.updated_at = datetime.now()

    def unlock_from_game(self) -> None:
        """
        Unlock character from game.
        Allows character to be used in another game or deleted.
        """
        self.active_game = None
        self.updated_at = datetime.now()

    def mark_dead(self) -> None:
        """
        Mark character as dead (D&D death mechanics).
        Character remains locked to game, user must select new character.
        """
        self.is_alive = False
        self.hp_current = 0
        self.updated_at = datetime.now()

    def resurrect(self) -> None:
        """
        Bring character back to life (resurrection spell, etc.).
        """
        self.is_alive = True
        self.hp_current = 1  # Revived with 1 HP
        self.updated_at = datetime.now()

