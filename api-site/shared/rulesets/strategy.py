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
from typing import Optional, TYPE_CHECKING


if TYPE_CHECKING:
    from modules.characters.domain.character_aggregate import CharacterAggregate
    from shared.rulesets.models import FeatDefinition, PactSlot


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

    @abstractmethod
    def is_feat_available(self, character: "CharacterAggregate", feat: "FeatDefinition") -> bool:
        """Whether the character meets a feat's prerequisites.

        Used for point-of-choice *guidance*, never to hide or block a choice
        (see core/product-principles.md §3.0). Prerequisites we cannot yet
        evaluate — e.g. ``spellcasting`` or ``class_feature``, whose backing data
        lands in later PRs — default to available; we err toward showing.
        """

    # ------------------------------------------------------------------ spellcasting

    @abstractmethod
    def spellcasting_ability(self, class_code: str) -> Optional[str]:
        """The ability code a class casts with (Int/Wis/Cha), or None for non-casters.

        Not derivable from ``primary_ability`` — half-casters (Paladin/Ranger) list a
        physical ability first but cast on a mental one.
        """

    @abstractmethod
    def compute_spell_slots(self, character: "CharacterAggregate") -> dict[int, int]:
        """Leveled spell slots ``{spell_level: count}`` for the character's primary
        spellcasting class. Empty for non-casters and for pure pact (Warlock) casters."""

    @abstractmethod
    def compute_pact_slots(self, character: "CharacterAggregate") -> Optional["PactSlot"]:
        """Warlock Pact Magic slots (count + slot level), or ``None``."""

    @abstractmethod
    def compute_spell_save_dc(self, character: "CharacterAggregate", ability_code: str) -> int:
        """Spell save DC = 8 + proficiency bonus + the given ability's modifier."""

    @abstractmethod
    def compute_spell_attack_bonus(self, character: "CharacterAggregate", ability_code: str) -> int:
        """Spell attack bonus = proficiency bonus + the given ability's modifier."""

    # ------------------------------------------------------------------ resources / AC

    @abstractmethod
    def compute_resource_pools(self, character: "CharacterAggregate") -> dict[str, int]:
        """Map of ``pool_code -> max uses`` for the character's classes (rage, sorcery points,
        channel divinity, …). Empty for classes with no pools."""

    @abstractmethod
    def resource_recharge(self, pool_code: str) -> str:
        """When a pool refills — ``"short_rest"`` or ``"long_rest"``."""

    @abstractmethod
    def list_ac_methods(self, character: "CharacterAggregate") -> list[dict]:
        """AC computation options available to the character, each ``{code, label, ac}``.

        Unarmored variants only until equipped armor (Phase J) adds armor-based methods.
        """
