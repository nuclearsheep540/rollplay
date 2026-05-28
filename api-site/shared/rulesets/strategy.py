# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Abstract base for per-edition rules math (XP→level, prof bonus, ASIs, modifiers).

Concrete strategies live in sibling modules (e.g. dnd_2024.py). The registry
resolves a character's edition_code to the right strategy.

The strategy is intentionally stateless and takes plain integers / value objects
rather than passing the full aggregate around — keeps the strategy testable
without spinning up a Character.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import TYPE_CHECKING


if TYPE_CHECKING:
    from modules.characters.domain.character_aggregate import CharacterAggregate


class RulesetStrategy(ABC):
    """Per-edition rules math. Implementations are singletons held by the registry."""

    #: The edition_code this strategy belongs to (e.g. "srd_5_2_1").
    edition_code: str

    @abstractmethod
    def xp_for_level(self, level: int) -> int:
        """Total XP needed to reach ``level``. ``xp_for_level(1) == 0``."""

    @abstractmethod
    def level_for_xp(self, xp: int) -> int:
        """Highest level whose XP threshold is ≤ ``xp``."""

    @abstractmethod
    def proficiency_bonus(self, level: int) -> int:
        """Proficiency bonus at a given character level (level 1 → +2, level 20 → +6)."""

    @abstractmethod
    def asi_levels_for_class(self, class_code: str) -> list[int]:
        """Per-class ASI levels (e.g. Fighter → [4, 6, 8, 12, 14, 16])."""

    @abstractmethod
    def hit_die_for_class(self, class_code: str) -> int:
        """Hit die size for the class (6, 8, 10, or 12)."""

    @abstractmethod
    def level_up_hp_options(self, character: "CharacterAggregate", class_code: str) -> dict:
        """Return ``{'average': int, 'max_roll': int}`` for HP gain at next level."""

    @abstractmethod
    def pending_asi_count(self, character: "CharacterAggregate") -> int:
        """Number of ASIs unlocked across all classes but not yet spent."""

    @abstractmethod
    def compute_skill_modifier(self, character: "CharacterAggregate", skill_code: str) -> int:
        """Skill check modifier (ability mod + prof if proficient + double if expertise)."""

    @abstractmethod
    def compute_save_modifier(self, character: "CharacterAggregate", ability_code: str) -> int:
        """Saving throw modifier (ability mod + prof if proficient)."""

    @abstractmethod
    def compute_initiative(self, character: "CharacterAggregate") -> int:
        """Initiative modifier (DEX mod by default; feats can override)."""
