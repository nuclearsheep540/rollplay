# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Dnd2024Ruleset math — the edition's pure rules tables.

Scope note (2026-09-12): the strategy's character-shaped methods went with the
system-agnostic rewrite, because a character is now whatever its campaign's config says it
is and nothing in a ruleset can read one. What is left — and what this covers — is the
edition's pure math, which is raw material for the D&D framework preset.
"""

import pytest

from shared.rulesets.registry import RulesetRegistry


@pytest.fixture(scope="module")
def ruleset():
    RulesetRegistry.reset()
    registry = RulesetRegistry.initialize()
    yield registry.get_ruleset("srd_5_2_1")
    RulesetRegistry.reset()


class TestXpAndLevel:
    @pytest.mark.parametrize("level,xp", [
        (1, 0), (2, 300), (3, 900), (4, 2700), (5, 6500), (10, 64000), (20, 355000),
    ])
    def test_xp_for_level_matches_srd_table(self, ruleset, level, xp):
        assert ruleset.xp_for_level(level) == xp

    @pytest.mark.parametrize("xp,expected_level", [
        (0, 1), (299, 1), (300, 2), (899, 2), (900, 3), (355000, 20), (999999, 20),
    ])
    def test_level_for_xp_picks_highest_threshold_below(self, ruleset, xp, expected_level):
        assert ruleset.level_for_xp(xp) == expected_level

    def test_negative_xp_rejected(self, ruleset):
        with pytest.raises(ValueError):
            ruleset.level_for_xp(-1)


class TestProficiencyBonus:
    @pytest.mark.parametrize("level,proficiency_bonus", [
        (1, 2), (4, 2), (5, 3), (8, 3), (9, 4), (12, 4), (13, 5), (16, 5), (17, 6), (20, 6),
    ])
    def test_proficiency_bonus_matches_table(self, ruleset, level, proficiency_bonus):
        assert ruleset.proficiency_bonus(level) == proficiency_bonus


class TestAbilityModifier:
    @pytest.mark.parametrize("score,modifier", [(1, -5), (8, -1), (10, 0), (11, 0), (14, 2), (20, 5), (30, 10)])
    def test_modifier_matches_table(self, ruleset, score, modifier):
        assert ruleset.ability_modifier(score) == modifier


class TestAsiLevels:
    def test_barbarian_has_standard_four(self, ruleset):
        assert ruleset.asi_levels_for_class("barbarian") == [4, 8, 12, 16]

    def test_fighter_gets_extras(self, ruleset):
        assert ruleset.asi_levels_for_class("fighter") == [4, 6, 8, 12, 14, 16]

    def test_rogue_gets_one_extra(self, ruleset):
        assert ruleset.asi_levels_for_class("rogue") == [4, 8, 10, 12, 16]


class TestHitDice:
    @pytest.mark.parametrize("class_code,die", [("barbarian", 12), ("fighter", 10), ("wizard", 6), ("rogue", 8)])
    def test_hit_die_for_class(self, ruleset, class_code, die):
        assert ruleset.hit_die_for_class(class_code) == die


class TestSpellcastingAbility:
    def test_casting_ability_includes_halfcaster_fix(self, ruleset):
        assert ruleset.spellcasting_ability("wizard") == "intelligence"
        assert ruleset.spellcasting_ability("cleric") == "wisdom"
        assert ruleset.spellcasting_ability("paladin") == "charisma"
        assert ruleset.spellcasting_ability("barbarian") is None
