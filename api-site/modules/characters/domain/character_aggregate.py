# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, replace
from datetime import datetime
from typing import Optional, Dict, List
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
            if not (1 <= score <= 20):
                raise ValueError(f"{ability.capitalize()} score must be between 1 and 20 (got {score})")

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


class CharacterBackground(str, Enum):
    """D&D 2024 Player's Handbook backgrounds"""
    ACOLYTE = "Acolyte"
    ARTISAN = "Artisan"
    CHARLATAN = "Charlatan"
    CRIMINAL = "Criminal"
    ENTERTAINER = "Entertainer"
    FARMER = "Farmer"
    GUARD = "Guard"
    GUIDE = "Guide"
    HERMIT = "Hermit"
    MERCHANT = "Merchant"
    NOBLE = "Noble"
    SAGE = "Sage"
    SAILOR = "Sailor"
    SCRIBE = "Scribe"
    SOLDIER = "Soldier"
    WAYFARER = "Wayfarer"

    def __str__(self) -> str:
        return self.value


@dataclass(frozen=True)
class CharacterClassInfo:
    """
    Value object representing a character class with its level.

    Used for multi-class support - each character can have 1-3 classes.
    Example: Fighter (level 5), Rogue (level 3)
    """
    character_class: CharacterClass
    level: int

    def __post_init__(self):
        """Validate class level"""
        if self.level < 1:
            raise ValueError(f"Class level must be at least 1 (got {self.level})")
        if self.level > 20:
            raise ValueError(f"Class level cannot exceed 20 (got {self.level})")


@dataclass
class CharacterAggregate:
    """
    Character aggregate root - represents a player character in the game.

    Characters are created by users and represent their in-game personas.

    Locking:
    - active_campaign: UUID of campaign character is locked to (can only be in one campaign at a time)
    - is_alive: Whether character is alive (for D&D death mechanics)

    D&D 2024 Origin:
    - background: Character's background (provides feat + ability bonuses)
    - origin_ability_bonuses: Dict of ability score bonuses from background (+2/+1 or +1/+1/+1)
    """
    id: Optional[UUID]
    user_id: UUID
    character_name: str
    character_classes: List[CharacterClassInfo]  # Changed from single class to list
    character_race: CharacterRace
    level: int  # Total character level (sum of all class levels)
    ability_scores: AbilityScores
    created_at: datetime
    updated_at: datetime
    hp_max: int
    hp_current: int
    ac: int
    background: Optional[CharacterBackground] = None  # D&D 2024: Character background
    origin_ability_bonuses: Dict[str, int] = None  # D&D 2024: Ability bonuses from background
    is_deleted: bool = False
    active_campaign: Optional[UUID] = None  # Campaign character is locked to
    is_alive: bool = True  # Character alive status (D&D death mechanics)

    def __post_init__(self):
        """Validate multi-class and origin bonus rules on aggregate creation/modification"""
        self._validate_multiclass()
        self._validate_origin_bonuses()

    def _validate_multiclass(self):
        """
        Validate multi-class business rules.

        Rules:
        - Must have at least 1 class
        - Cannot have more than 3 classes
        - Sum of class levels must equal total character level
        - No duplicate classes
        """
        if not self.character_classes or len(self.character_classes) == 0:
            raise ValueError("Character must have at least one class")

        if len(self.character_classes) > 3:
            raise ValueError("Character cannot have more than 3 classes")

        # Validate total class levels match character level
        total_class_levels = sum(c.level for c in self.character_classes)
        if total_class_levels != self.level:
            raise ValueError(
                f"Sum of class levels ({total_class_levels}) must equal character level ({self.level})"
            )

        # Check for duplicate classes
        class_names = [c.character_class for c in self.character_classes]
        if len(class_names) != len(set(class_names)):
            raise ValueError("Character cannot have duplicate classes")

    def _validate_origin_bonuses(self):
        """
        Validate D&D 2024 origin ability bonuses business rules.

        Rules:
        - If origin_ability_bonuses provided, must sum to exactly 3 points
        - Valid patterns: +2/+1 (two abilities) or +1/+1/+1 (three abilities)
        - Ability names must be valid (str, dex, con, int, wis, cha)
        - Cannot apply bonuses that would exceed max 20 for any ability
        - Bonuses must be positive integers
        """
        if not self.origin_ability_bonuses:
            # No bonuses provided is valid (optional field)
            return

        valid_abilities = {'strength', 'dexterity', 'constitution', 'intelligence', 'wisdom', 'charisma'}

        # Validate ability names
        for ability in self.origin_ability_bonuses.keys():
            if ability not in valid_abilities:
                raise ValueError(f"Invalid ability name '{ability}' in origin bonuses")

        # Validate bonuses are positive integers
        for ability, bonus in self.origin_ability_bonuses.items():
            if not isinstance(bonus, int) or bonus < 0:
                raise ValueError(f"Origin bonus for {ability} must be a positive integer (got {bonus})")

        # Validate total points
        total_bonus = sum(self.origin_ability_bonuses.values())
        if total_bonus != 3:
            raise ValueError(f"Origin ability bonuses must sum to exactly 3 points (got {total_bonus})")

        # Validate no ability exceeds 20 after bonuses
        for ability, bonus in self.origin_ability_bonuses.items():
            base_score = getattr(self.ability_scores, ability)
            final_score = base_score + bonus
            if final_score > 20:
                raise ValueError(
                    f"{ability.capitalize()} would exceed max 20 with bonus "
                    f"(base {base_score} + {bonus} = {final_score})"
                )

    @classmethod
    def create(
        cls,
        active_campaign: None,
        user_id: UUID,  # owner
        character_name: str,
        character_classes: List[CharacterClassInfo],  # Changed from single class
        character_race: CharacterRace,
        hp_max: int,
        hp_current: int,
        ac: int,
        level: int = 1,
        ability_scores: Optional[AbilityScores] = None,
        background: Optional[CharacterBackground] = None,  # D&D 2024
        origin_ability_bonuses: Optional[Dict[str, int]] = None,  # D&D 2024
    ) -> 'CharacterAggregate':
        """
        Create new character with business rules validation.

        Business Rules:
        - Character name must be provided and valid
        - Character name max 50 characters
        - Must have at least 1 class (validated by __post_init__)
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

        # Business rule: Character classes must be provided
        if not character_classes or len(character_classes) == 0:
            raise ValueError("Character must have at least one class")

        # Business rule: Character race must be provided
        if not character_race:
            raise ValueError("Character race is required")

        # Business rule: Level must be valid
        if level < 1 or level > 20:
            raise ValueError("Character level must be between 1 and 20")

        # Business rule: Must belong to a user
        if not user_id:
            raise ValueError("Character must belong to a user")

        # Default ability scores to 10 if not provided
        if not ability_scores:
            ability_scores = AbilityScores(
                strength=10,
                dexterity=10,
                constitution=10,
                intelligence=10,
                wisdom=10,
                charisma=10
            )

        now = datetime.now()
        return cls(
            id=None,  # Will be set by repository
            user_id=user_id,
            character_name=normalized_name,
            character_classes=character_classes,  # Now a list
            character_race=character_race,
            level=level,
            ability_scores=ability_scores,
            created_at=now,
            updated_at=now,
            background=background,  # D&D 2024
            origin_ability_bonuses=origin_ability_bonuses or {},  # D&D 2024, default to empty dict
            is_deleted=False,
            active_campaign=None,  # New characters not locked to any campaign
            is_alive=True,  # New characters start alive
            hp_max=hp_max,
            hp_current=hp_current,
            ac=ac
        )

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if character is owned by specific user"""
        return self.user_id == user_id

    def get_final_ability_scores(self) -> Dict[str, int]:
        """
        Get final ability scores with origin bonuses applied.

        Returns dict with base + origin bonus for each ability.
        Example: {"strength": 17, "dexterity": 14, ...}
        """
        base_scores = self.ability_scores.to_dict()

        if not self.origin_ability_bonuses:
            return base_scores

        final_scores = base_scores.copy()
        for ability, bonus in self.origin_ability_bonuses.items():
            final_scores[ability] = base_scores[ability] + bonus

        return final_scores

    def soft_delete(self):
        """Soft delete the character"""
        self.is_deleted = True

    def can_be_deleted(self) -> bool:
        """
        Business rule: Characters cannot be deleted if locked to a campaign.
        Must leave campaign first to unlock character before deletion.
        """
        return self.active_campaign is None

    def is_locked(self) -> bool:
        """Check if character is locked to a campaign."""
        return self.active_campaign is not None

    def get_display_name(self) -> str:
        """Get formatted display name with all classes"""
        if len(self.character_classes) == 1:
            class_info = self.character_classes[0]
            return f"{self.character_name} (Level {self.level} {class_info.character_class.value})"
        else:
            # Multi-class: "Name (Level 8 Fighter 5 / Rogue 3)"
            class_parts = [f"{c.character_class.value} {c.level}" for c in self.character_classes]
            return f"{self.character_name} (Level {self.level} {' / '.join(class_parts)})"

    def get_primary_class(self) -> CharacterClass:
        """
        Get primary class (highest level class).

        If multiple classes have the same level, returns the first one.
        """
        if not self.character_classes:
            raise ValueError("Character has no classes")

        primary = max(self.character_classes, key=lambda c: c.level)
        return primary.character_class

    def add_class(self, character_class: CharacterClass, class_level: int) -> None:
        """
        Add a new class (multi-classing).

        Business Rules:
        - Must be character level 3+ to multi-class
        - Cannot exceed 3 classes
        - Cannot have duplicate class
        - Class level must be at least 1
        - New total level (current + class_level) cannot exceed 20
        """
        # Business rule: Must be level 3+ to multi-class (D&D 5e standard)
        if self.level < 3 and len(self.character_classes) >= 1:
            raise ValueError("Character must be level 3+ to multi-class")

        # Business rule: Cannot exceed 3 classes
        if len(self.character_classes) >= 3:
            raise ValueError("Character cannot have more than 3 classes")

        # Business rule: Cannot have duplicate class
        existing_classes = [c.character_class for c in self.character_classes]
        if character_class in existing_classes:
            raise ValueError(f"Character already has {character_class.value} class")

        # Business rule: Class level must be valid
        if class_level < 1:
            raise ValueError("Class level must be at least 1")

        # Business rule: Total level cannot exceed 20
        new_total_level = self.level + class_level
        if new_total_level > 20:
            raise ValueError(f"Adding class would exceed max level 20 (new total: {new_total_level})")

        # Add the class
        new_class_info = CharacterClassInfo(character_class=character_class, level=class_level)
        self.character_classes.append(new_class_info)
        self.level = new_total_level
        self.updated_at = datetime.now()

    def remove_class(self, character_class: CharacterClass) -> None:
        """
        Remove a class from character.

        Business Rules:
        - Cannot remove last class (must have at least 1)
        - Reduces total character level by removed class level
        """
        # Business rule: Cannot remove last class
        if len(self.character_classes) <= 1:
            raise ValueError("Cannot remove last class - character must have at least one class")

        # Find the class to remove
        class_to_remove = None
        for class_info in self.character_classes:
            if class_info.character_class == character_class:
                class_to_remove = class_info
                break

        if not class_to_remove:
            raise ValueError(f"Character does not have {character_class.value} class")

        # Remove the class and adjust level
        self.character_classes.remove(class_to_remove)
        self.level -= class_to_remove.level
        self.updated_at = datetime.now()

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
        character_classes: Optional[List[CharacterClassInfo]] = None,
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
        - Character classes must be validated by _validate_multiclass()
        - Character race must be valid if provided
        """
        if character_name is not None:
            normalized_name = character_name.strip()
            if not normalized_name:
                raise ValueError("Character name cannot be empty")
            if len(normalized_name) > 50:
                raise ValueError("Character name too long (max 50 characters)")
            self.character_name = normalized_name

        if character_classes is not None:
            if not character_classes or len(character_classes) == 0:
                raise ValueError("Character must have at least one class")
            self.character_classes = character_classes
            # Revalidate multi-class rules
            self._validate_multiclass()

        if character_race is not None:
            if not character_race:
                raise ValueError("Character race is required")
            self.character_race = character_race

        if level is not None:
            if level < 1 or level > 20:
                raise ValueError("Character level must be between 1 and 20")
            self.level = level
            # Revalidate that class levels still match total level
            self._validate_multiclass()

        if hp_max is not None:
            self.hp_max = hp_max

        if hp_current is not None:
            # you can have temporary hitpoints so current may exceed max
            self.hp_current = hp_current

        if ac is not None:
            self.ac = ac

        self.updated_at = datetime.now()

    def lock_to_campaign(self, campaign_id: UUID) -> None:
        """
        Lock character to a specific campaign.
        Characters can only be locked to one campaign at a time.

        Business Rules:
        - Character must not already be locked
        - Dead characters can still be locked (they remain in roster)
        """
        if self.active_campaign is not None:
            raise ValueError(f"Character already locked to campaign {self.active_campaign}")

        self.active_campaign = campaign_id
        self.updated_at = datetime.now()

    def unlock_from_campaign(self) -> None:
        """
        Unlock character from campaign.
        Allows character to be used in another campaign or deleted.
        """
        self.active_campaign = None
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

