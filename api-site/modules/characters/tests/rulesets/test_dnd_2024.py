# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Dnd2024Ruleset math tests — XP table, prof bonus, ASI count, modifiers."""

from datetime import datetime
from uuid import uuid4

import pytest

from modules.characters.domain.character_aggregate import (
    AbilityScores,
    CharacterAggregate,
    ClassEntry,
    FeatAcquisition,
    SkillProficiency,
)
from shared.rulesets.registry import RulesetRegistry


@pytest.fixture(scope="module")
def ruleset():
    RulesetRegistry.reset()
    reg = RulesetRegistry.initialize()
    yield reg.get_ruleset("srd_5_2_1")
    RulesetRegistry.reset()


def _make_character(**overrides) -> CharacterAggregate:
    """Build a CharacterAggregate directly (bypasses repository for unit tests)."""
    now = datetime.utcnow()
    defaults = dict(
        id=uuid4(),
        user_id=uuid4(),
        edition_id=1,
        edition_code="srd_5_2_1",
        active_campaign=None,
        character_name="Tester",
        species_code="human",
        background_code="soldier",
        class_entries=[ClassEntry("fighter", 1, True)],
        ability_scores=AbilityScores.default(),
        save_proficiencies=frozenset({"strength", "constitution"}),
        skills=[],
        feats=[],
        level=1,
        xp=0,
        hp_max=10,
        hp_current=10,
        hp_temp=0,
        ac=14,
        death_save_successes=0,
        death_save_failures=0,
        inspiration=False,
        status_effects=[],
        is_alive=True,
        speed=30,
        size="Medium",
        languages=["Common"],
        is_draft=False,
        creation_step=None,
        created_at=now,
        updated_at=now,
    )
    defaults.update(overrides)
    return CharacterAggregate(**defaults)


class TestXpAndLevel:
    @pytest.mark.parametrize("level,xp", [
        (1, 0), (2, 300), (3, 900), (4, 2700), (5, 6500),
        (10, 64000), (15, 165000), (20, 355000),
    ])
    def test_xp_for_level_matches_srd_table(self, ruleset, level, xp):
        assert ruleset.xp_for_level(level) == xp

    @pytest.mark.parametrize("xp,expected_level", [
        (0, 1),
        (299, 1),
        (300, 2),
        (6499, 4),
        (6500, 5),
        (354_999, 19),
        (355_000, 20),
        (10_000_000, 20),
    ])
    def test_level_for_xp_picks_highest_threshold_below(self, ruleset, xp, expected_level):
        assert ruleset.level_for_xp(xp) == expected_level

    def test_negative_xp_rejected(self, ruleset):
        with pytest.raises(ValueError):
            ruleset.level_for_xp(-1)


class TestProficiencyBonus:
    @pytest.mark.parametrize("level,pb", [
        (1, 2), (4, 2), (5, 3), (8, 3),
        (9, 4), (12, 4),
        (13, 5), (16, 5),
        (17, 6), (20, 6),
    ])
    def test_proficiency_bonus_matches_table(self, ruleset, level, pb):
        assert ruleset.proficiency_bonus(level) == pb


class TestAsiLevels:
    def test_barbarian_has_standard_four(self, ruleset):
        assert ruleset.asi_levels_for_class("barbarian") == [4, 8, 12, 16]

    def test_fighter_gets_extras(self, ruleset):
        assert ruleset.asi_levels_for_class("fighter") == [4, 6, 8, 12, 14, 16]

    def test_rogue_gets_one_extra(self, ruleset):
        assert ruleset.asi_levels_for_class("rogue") == [4, 8, 10, 12, 16]


class TestHpOptions:
    def test_average_and_max_for_barbarian_d12(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 4, True)],
            level=4,
            ability_scores=AbilityScores(10, 10, 14, 10, 10, 10),  # CON 14 → +2
        )
        opts = ruleset.level_up_hp_options(ch, "barbarian")
        # d12: average = 12/2 + 1 = 7, plus CON +2 → 9; max_roll = 12 + 2 = 14
        assert opts == {"average": 9, "max_roll": 14}

    def test_wizard_d6_with_negative_con(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("wizard", 3, True)],
            level=3,
            ability_scores=AbilityScores(10, 14, 8, 16, 10, 10),  # CON 8 → -1
        )
        opts = ruleset.level_up_hp_options(ch, "wizard")
        # d6: average = 3 + 1 = 4, plus CON -1 → 3; max_roll = 6 - 1 = 5
        assert opts == {"average": 3, "max_roll": 5}


class TestPendingAsiCount:
    def test_zero_below_first_asi_level(self, ruleset):
        ch = _make_character(class_entries=[ClassEntry("barbarian", 3, True)], level=3)
        assert ruleset.pending_asi_count(ch) == 0

    def test_one_unlocked_at_level_four(self, ruleset):
        ch = _make_character(class_entries=[ClassEntry("barbarian", 4, True)], level=4)
        assert ruleset.pending_asi_count(ch) == 1

    def test_decrements_when_asi_is_spent(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 8, True)],
            level=8,
            feats=[FeatAcquisition("ability_score_improvement", 4, "ASI")],
        )
        # 2 unlocked (levels 4 + 8), 1 spent → 1 pending
        assert ruleset.pending_asi_count(ch) == 1


class TestSkillModifier:
    def test_unproficient_uses_ability_modifier_only(self, ruleset):
        ch = _make_character(ability_scores=AbilityScores(16, 10, 10, 10, 10, 10))
        # Athletics governed by STR (16 → +3)
        assert ruleset.compute_skill_modifier(ch, "athletics") == 3

    def test_proficient_adds_prof_bonus(self, ruleset):
        ch = _make_character(
            level=5,
            ability_scores=AbilityScores(16, 10, 10, 10, 10, 10),
            skills=[SkillProficiency("athletics", "CLASS")],
        )
        # STR mod 3 + prof bonus 3 (level 5) = 6
        assert ruleset.compute_skill_modifier(ch, "athletics") == 6

    def test_expertise_doubles_prof_bonus(self, ruleset):
        ch = _make_character(
            level=5,
            ability_scores=AbilityScores(16, 10, 10, 10, 10, 10),
            skills=[SkillProficiency("athletics", "CLASS", expertise=True)],
        )
        # STR mod 3 + 2× prof bonus (6) = 9
        assert ruleset.compute_skill_modifier(ch, "athletics") == 9


class TestSaveModifier:
    def test_proficient_save_adds_prof(self, ruleset):
        ch = _make_character(
            level=5,
            ability_scores=AbilityScores(16, 10, 14, 10, 10, 10),
            save_proficiencies=frozenset({"strength", "constitution"}),
        )
        # STR save: mod 3 + PB 3 = 6
        assert ruleset.compute_save_modifier(ch, "strength") == 6
        # CON save: mod 2 + PB 3 = 5
        assert ruleset.compute_save_modifier(ch, "constitution") == 5

    def test_non_proficient_save_is_just_ability_mod(self, ruleset):
        ch = _make_character(
            level=5,
            ability_scores=AbilityScores(10, 10, 10, 14, 10, 10),
            save_proficiencies=frozenset({"strength", "constitution"}),
        )
        assert ruleset.compute_save_modifier(ch, "intelligence") == 2


class TestInitiative:
    def test_initiative_is_dex_modifier(self, ruleset):
        ch = _make_character(ability_scores=AbilityScores(10, 18, 10, 10, 10, 10))
        assert ruleset.compute_initiative(ch) == 4
