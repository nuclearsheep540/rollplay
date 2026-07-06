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
from typing import Optional, TYPE_CHECKING

from shared.rulesets.strategy import RulesetStrategy


if TYPE_CHECKING:
    from modules.characters.domain.character_aggregate import CharacterAggregate
    from shared.rulesets.models import FeatDefinition, PactSlot
    from shared.rulesets.registry import RulesetRegistry


# Spellcasting ability per class (SRD 2024). NOT derivable from primary_ability:
# Paladin lists Strength first but casts on Charisma; Ranger lists Dexterity but casts on
# Wisdom. Non-casters are absent (spellcasting_ability returns None for them).
_SPELLCASTING_ABILITY: dict[str, str] = {
    "bard": "charisma",
    "cleric": "wisdom",
    "druid": "wisdom",
    "paladin": "charisma",
    "ranger": "wisdom",
    "sorcerer": "charisma",
    "warlock": "charisma",
    "wizard": "intelligence",
}


# Resource pools whose MAX is a numeric column in the class progression table (class_specific).
# Map class_code -> {table column name: pool_code}. A "—" cell means the pool isn't available
# at that level yet (skipped). Formula-based pools (bardic inspiration, lay on hands) are handled
# directly in compute_resource_pools. Rarer pools (action surge count, indomitable, hunter's mark
# free casts) are not yet wired — they land when their UI needs them.
_RESOURCE_COLUMNS: dict[str, dict[str, str]] = {
    "barbarian": {"Rages": "rage"},
    "sorcerer": {"Sorcery Points": "sorcery_points"},
    "cleric": {"Channel Divinity": "channel_divinity"},
    "paladin": {"Channel Divinity": "channel_divinity"},
    "fighter": {"Second Wind": "second_wind"},
    "monk": {"Focus Points": "monk_focus"},
    "druid": {"Wild Shape": "wild_shape"},
}

# When each pool refills. Single cadence per pool (the shorter one where the SRD allows either).
_RESOURCE_RECHARGE: dict[str, str] = {
    "rage": "long_rest",
    "sorcery_points": "long_rest",
    "channel_divinity": "short_rest",
    "second_wind": "short_rest",
    "monk_focus": "short_rest",
    "wild_shape": "short_rest",
    "bardic_inspiration": "short_rest",
    "lay_on_hands_hp": "long_rest",
}


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

    def ability_modifier(self, score: int) -> int:
        return _ability_modifier(score)

    # ------------------------------------------------------------------ class lookups

    def asi_levels_for_class(self, class_code: str) -> list[int]:
        cls = self._registry.get_class(self.edition_code, class_code)
        return list(cls.asi_levels)

    def hit_die_for_class(self, class_code: str) -> int:
        return self._registry.get_class(self.edition_code, class_code).hit_die

    # ------------------------------------------------------------------ aggregate-aware

    def level_up_hp_options(self, character: "CharacterAggregate", class_code: str) -> dict:
        hit_die = self.hit_die_for_class(class_code)
        con_mod = _ability_modifier(character.final_ability_score("constitution"))
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
        ability_score = character.final_ability_score(skill.ability)
        mod = _ability_modifier(ability_score)
        prof_entries = [s for s in character.skills if s.skill_code == skill_code]
        if not prof_entries:
            return mod
        pb = self.proficiency_bonus(character.level)
        # Expertise stacks once: prof becomes 2× proficiency bonus.
        prof_bonus = pb * 2 if any(s.expertise for s in prof_entries) else pb
        return mod + prof_bonus

    def compute_save_modifier(self, character: "CharacterAggregate", ability_code: str) -> int:
        mod = _ability_modifier(character.final_ability_score(ability_code))
        if ability_code in character.save_proficiencies:
            mod += self.proficiency_bonus(character.level)
        return mod

    def compute_initiative(self, character: "CharacterAggregate") -> int:
        return _ability_modifier(character.final_ability_score("dexterity"))

    def is_feat_available(
        self, character: "CharacterAggregate", feat: "FeatDefinition", *, at_level: int = None
    ) -> bool:
        """``at_level`` overrides the level a LEVEL prereq is checked against — pass the *target*
        level in the level-up preview so a feat gated at the level you're about to reach (ASI at 4,
        Epic Boons at 19) is bucketed as qualifying, not 'prerequisites not met'."""
        level = at_level if at_level is not None else character.level
        # A non-repeatable feat already taken is no longer available.
        if not feat.repeatable and any(f.feat_code == feat.code for f in character.feats):
            return False
        for prereq in feat.prerequisites:
            if prereq.type == "level":
                if level < (prereq.value or 0):
                    return False
            elif prereq.type == "ability" and prereq.abilities:
                if character.final_ability_score(prereq.abilities[0]) < (prereq.value or 0):
                    return False
            elif prereq.type == "ability_any" and prereq.abilities:
                threshold = prereq.value or 0
                if not any(
                    character.final_ability_score(a) >= threshold for a in prereq.abilities
                ):
                    return False
            # Anything else — "spellcasting" / "class" / "class_feature", or an ability
            # prereq with no abilities listed — can't be verified yet, so we leave the feat
            # available: we guide, we never hide (core/product-principles.md §3.0).
        return True

    # ------------------------------------------------------------------ spellcasting

    def spellcasting_ability(self, class_code: str) -> Optional[str]:
        return _SPELLCASTING_ABILITY.get(class_code)

    def compute_spell_slots(self, character: "CharacterAggregate") -> dict[int, int]:
        """Leveled slots for the primary spellcasting class, indexed by that class's level.

        Single-class only. Multiclass combined-caster-level math isn't implemented, so for a
        multiclass character we return {} ("unknown") rather than the primary class's slots — those
        would be WRONG for a multiclass caster, whose slots come from the shared multiclass table
        keyed by combined caster level, not any one class's level.
        """
        primary = character.get_primary_class()
        if primary is None:
            return {}
        if len(character.class_entries) > 1:
            return {}
        cls = self._registry.get_class(self.edition_code, primary.class_code)
        if cls.spellcasting is None:
            return {}
        by_level = cls.spellcasting.spell_slots_by_level.get(str(primary.level), {})
        return {int(lvl): int(count) for lvl, count in by_level.items()}

    def compute_pact_slots(self, character: "CharacterAggregate") -> Optional["PactSlot"]:
        primary = character.get_primary_class()
        if primary is None:
            return None
        cls = self._registry.get_class(self.edition_code, primary.class_code)
        if cls.spellcasting is None:
            return None
        return cls.spellcasting.pact_slots_by_level.get(str(primary.level))

    def compute_spell_save_dc(self, character: "CharacterAggregate", ability_code: str) -> int:
        return (
            8
            + self.proficiency_bonus(character.level)
            + _ability_modifier(character.final_ability_score(ability_code))
        )

    def compute_spell_attack_bonus(self, character: "CharacterAggregate", ability_code: str) -> int:
        return self.proficiency_bonus(character.level) + _ability_modifier(
            character.final_ability_score(ability_code)
        )

    # ------------------------------------------------------------------ resources / AC

    def compute_resource_pools(self, character: "CharacterAggregate") -> dict[str, int]:
        pools: dict[str, int] = {}
        for entry in character.class_entries:
            col_map = _RESOURCE_COLUMNS.get(entry.class_code)
            if not col_map:
                continue
            cls = self._registry.get_class(self.edition_code, entry.class_code)
            level_data = cls.features_by_level.get(str(entry.level))
            if level_data is None:
                continue
            for column, pool_code in col_map.items():
                value = level_data.class_specific.get(column)
                if isinstance(value, int) and value > 0:  # "—"/0 ⇒ not available yet
                    # Accumulate across classes so a shared multiclass pool (Cleric + Paladin
                    # Channel Divinity) combines rather than the last class overwriting it.
                    pools[pool_code] = pools.get(pool_code, 0) + value
        # Formula pools.
        if any(e.class_code == "bard" for e in character.class_entries):
            cha_mod = _ability_modifier(character.final_ability_score("charisma"))
            pools["bardic_inspiration"] = max(1, cha_mod)
        paladin = next((e for e in character.class_entries if e.class_code == "paladin"), None)
        if paladin is not None:
            pools["lay_on_hands_hp"] = 5 * paladin.level
        return pools

    def resource_recharge(self, pool_code: str) -> str:
        return _RESOURCE_RECHARGE.get(pool_code, "long_rest")

    def list_ac_methods(self, character: "CharacterAggregate") -> list[dict]:
        dex = _ability_modifier(character.final_ability_score("dexterity"))
        methods = [{"code": "unarmored", "label": "Unarmored", "ac": 10 + dex}]
        classes = {e.class_code for e in character.class_entries}
        if "barbarian" in classes:
            con = _ability_modifier(character.final_ability_score("constitution"))
            methods.append({
                "code": "barbarian_unarmored_defense",
                "label": "Unarmored Defense (Barbarian)",
                "ac": 10 + dex + con,
            })
        if "monk" in classes:
            wis = _ability_modifier(character.final_ability_score("wisdom"))
            methods.append({
                "code": "monk_unarmored_defense",
                "label": "Unarmored Defense (Monk)",
                "ac": 10 + dex + wis,
            })
        return methods

    # ------------------------------------------------------------------ HP / eligibility

    def compute_hp_max(self, character: "CharacterAggregate") -> int:
        primary = character.get_primary_class()
        if primary is None:
            return max(1, character.hp_max)
        con_mod = _ability_modifier(character.final_ability_score("constitution"))
        total = 0
        first_level_used = False
        for entry in character.class_entries:
            die = self.hit_die_for_class(entry.class_code)
            average = (die // 2) + 1
            for _ in range(entry.level):
                # Only the very first level of the starting (primary) class gets the max die.
                if entry.class_code == primary.class_code and not first_level_used:
                    total += die
                    first_level_used = True
                else:
                    total += average
        total += con_mod * character.level
        return max(1, total)

    def can_pick_subclass(self, character: "CharacterAggregate", class_code: str) -> bool:
        cls = self._registry.get_class(self.edition_code, class_code)
        if cls.subclass_level is None:
            return False
        entry = next((e for e in character.class_entries if e.class_code == class_code), None)
        return entry is not None and entry.level >= cls.subclass_level

    def can_add_class(self, character: "CharacterAggregate", class_code: str) -> bool:
        def meets(cls_def) -> bool:
            # "any" (not "all") of the primary abilities — captures the SRD "X or Y" classes
            # permissively; this is a hint, never a gate.
            return any(character.final_ability_score(a) >= 13 for a in cls_def.primary_ability)

        new_cls = self._registry.get_class(self.edition_code, class_code)
        if not meets(new_cls):
            return False
        return all(
            meets(self._registry.get_class(self.edition_code, e.class_code))
            for e in character.class_entries
        )
