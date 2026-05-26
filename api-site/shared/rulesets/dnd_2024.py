# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
D&D 2024 (5.5e / SRD 5.2.1) ruleset strategy.

Holds the XP→level table, proficiency-bonus table, and the modifier-calculation
formulas. Looks up class-specific data (hit die, ASI levels) via the registry
that owns this strategy.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING

from shared.rulesets.strategy import RulesetStrategy


if TYPE_CHECKING:
    from modules.characters.domain.character_aggregate import CharacterAggregate
    from shared.rulesets.registry import RulesetRegistry


# XP thresholds — index = character level, value = total XP required to reach it.
# Source: SRD 5.2.1 "Beyond Level 1" experience-points table.
_XP_THRESHOLDS: list[int] = [
    0,        # level 1
    300,      # level 2
    900,
    2700,
    6500,
    14000,
    23000,
    34000,
    48000,
    64000,
    85000,
    100000,
    120000,
    140000,
    165000,
    195000,
    225000,
    265000,
    305000,
    355000,   # level 20
]


# Proficiency bonus by character level (1–20). Index = level, value = bonus.
_PROFICIENCY_BONUS: list[int] = [
    2, 2, 2, 2,   # 1-4
    3, 3, 3, 3,   # 5-8
    4, 4, 4, 4,   # 9-12
    5, 5, 5, 5,   # 13-16
    6, 6, 6, 6,   # 17-20
]


def _ability_modifier(score: int) -> int:
    """Standard D&D modifier formula: ``(score - 10) // 2`` (rounded toward −∞)."""
    return math.floor((score - 10) / 2)


class Dnd2024Ruleset(RulesetStrategy):
    """SRD 5.2.1 rules math. Bound to a registry so it can resolve class metadata."""

    edition_code = "srd_5_2_1"

    def __init__(self, registry: "RulesetRegistry"):
        self._registry = registry

    # ------------------------------------------------------------------ XP / level

    def xp_for_level(self, level: int) -> int:
        if not 1 <= level <= 20:
            raise ValueError(f"Level must be 1..20, got {level}")
        return _XP_THRESHOLDS[level - 1]

    def level_for_xp(self, xp: int) -> int:
        if xp < 0:
            raise ValueError(f"XP cannot be negative (got {xp})")
        # Highest level whose threshold ≤ xp.
        for level in range(20, 0, -1):
            if xp >= _XP_THRESHOLDS[level - 1]:
                return level
        return 1  # unreachable but keeps mypy happy

    def proficiency_bonus(self, level: int) -> int:
        if not 1 <= level <= 20:
            raise ValueError(f"Level must be 1..20, got {level}")
        return _PROFICIENCY_BONUS[level - 1]

    # ------------------------------------------------------------------ class lookups

    def asi_levels_for_class(self, class_code: str) -> list[int]:
        cls = self._registry.get_class(self.edition_code, class_code)
        return list(cls.asi_levels)

    def hit_die_for_class(self, class_code: str) -> int:
        return self._registry.get_class(self.edition_code, class_code).hit_die

    # ------------------------------------------------------------------ aggregate-aware

    def level_up_hp_options(self, character: "CharacterAggregate", class_code: str) -> dict:
        hit_die = self.hit_die_for_class(class_code)
        con_mod = _ability_modifier(character.ability_score("constitution"))
        # Average HP per 5e convention: (hit_die / 2) + 1, then + CON mod.
        average = (hit_die // 2) + 1 + con_mod
        max_roll = hit_die + con_mod
        return {"average": max(1, average), "max_roll": max(1, max_roll)}

    def pending_asi_count(self, character: "CharacterAggregate") -> int:
        """Total ASIs unlocked from class levels minus ASIs already spent.

        Each class's ASI count is the number of entries in its ``asi_levels`` list
        that are ≤ the character's level in that class. ASIs spent are tracked
        on the character via :class:`FeatAcquisition` rows with source ``ASI``.
        """
        unlocked = 0
        for entry in character.class_entries:
            asis = self.asi_levels_for_class(entry.class_code)
            unlocked += sum(1 for lvl in asis if lvl <= entry.level)
        spent = sum(1 for feat in character.feats if feat.source == "ASI")
        return max(0, unlocked - spent)

    def compute_skill_modifier(self, character: "CharacterAggregate", skill_code: str) -> int:
        skill = self._registry.get_skill(self.edition_code, skill_code)
        ability_score = character.ability_score(skill.ability)
        mod = _ability_modifier(ability_score)
        prof_entries = [s for s in character.skills if s.skill_code == skill_code]
        if not prof_entries:
            return mod
        pb = self.proficiency_bonus(character.level)
        # Expertise stacks once: prof becomes 2× proficiency bonus.
        prof_bonus = pb * 2 if any(s.expertise for s in prof_entries) else pb
        return mod + prof_bonus

    def compute_save_modifier(self, character: "CharacterAggregate", ability_code: str) -> int:
        mod = _ability_modifier(character.ability_score(ability_code))
        if ability_code in character.save_proficiencies:
            mod += self.proficiency_bonus(character.level)
        return mod

    def compute_initiative(self, character: "CharacterAggregate") -> int:
        return _ability_modifier(character.ability_score("dexterity"))
