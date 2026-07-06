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
        origin_ability_bonuses={},
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


class TestSpellcasting:
    def test_casting_ability_includes_halfcaster_fix(self, ruleset):
        assert ruleset.spellcasting_ability("wizard") == "intelligence"
        assert ruleset.spellcasting_ability("cleric") == "wisdom"
        # Half-casters cast on a mental stat, NOT their primary_ability[0].
        assert ruleset.spellcasting_ability("paladin") == "charisma"
        assert ruleset.spellcasting_ability("ranger") == "wisdom"
        # Non-casters have no spellcasting ability.
        assert ruleset.spellcasting_ability("fighter") is None

    def test_wizard_l1_has_two_first_level_slots(self, ruleset):
        ch = _make_character(class_entries=[ClassEntry("wizard", 1, True)], level=1)
        assert ruleset.compute_spell_slots(ch) == {1: 2}
        assert ruleset.compute_pact_slots(ch) is None

    def test_warlock_uses_pact_slots_not_spell_slots(self, ruleset):
        ch = _make_character(class_entries=[ClassEntry("warlock", 1, True)], level=1)
        assert ruleset.compute_spell_slots(ch) == {}
        pact = ruleset.compute_pact_slots(ch)
        assert pact is not None and pact.count == 1 and pact.slot_level == 1

    def test_noncaster_has_no_slots(self, ruleset):
        ch = _make_character(class_entries=[ClassEntry("fighter", 1, True)], level=1)
        assert ruleset.compute_spell_slots(ch) == {}
        assert ruleset.compute_pact_slots(ch) is None

    def test_spell_save_dc_and_attack(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("wizard", 1, True)],
            level=1,
            ability_scores=AbilityScores(8, 14, 12, 16, 10, 10),
        )
        # DC = 8 + prof(2) + INT mod(+3) = 13; attack = 2 + 3 = 5.
        assert ruleset.compute_spell_save_dc(ch, "intelligence") == 13
        assert ruleset.compute_spell_attack_bonus(ch, "intelligence") == 5


class TestResourcePools:
    def test_barbarian_rage_scales_with_level(self, ruleset):
        assert ruleset.compute_resource_pools(
            _make_character(class_entries=[ClassEntry("barbarian", 1, True)], level=1)
        ) == {"rage": 2}
        assert ruleset.compute_resource_pools(
            _make_character(class_entries=[ClassEntry("barbarian", 5, True)], level=5)
        ) == {"rage": 3}

    def test_formula_pools(self, ruleset):
        # Bardic Inspiration = Cha modifier; Paladin Lay on Hands = 5 × level.
        bard = _make_character(
            class_entries=[ClassEntry("bard", 1, True)],
            ability_scores=AbilityScores(8, 14, 12, 10, 10, 16),
        )
        assert ruleset.compute_resource_pools(bard)["bardic_inspiration"] == 3
        pal = _make_character(class_entries=[ClassEntry("paladin", 3, True)], level=3)
        pools = ruleset.compute_resource_pools(pal)
        assert pools["lay_on_hands_hp"] == 15 and pools["channel_divinity"] == 2

    def test_noncaster_resourceless_class_has_no_pools(self, ruleset):
        assert ruleset.compute_resource_pools(
            _make_character(class_entries=[ClassEntry("wizard", 1, True)], level=1)
        ) == {}

    def test_multiclass_shared_pool_combines_not_overwrites(self, ruleset):
        """A Cleric/Paladin multiclass combines Channel Divinity instead of last-class-wins."""
        ch = _make_character(
            class_entries=[ClassEntry("cleric", 3, True), ClassEntry("paladin", 5, False)],
            level=8,
        )
        # Cleric 3 → 2 + Paladin 5 → 2 = 4 (not silently overwritten to 2).
        assert ruleset.compute_resource_pools(ch)["channel_divinity"] == 4


class TestHpMax:
    def test_l1_gets_max_die_plus_con(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 1, True)], level=1,
            ability_scores=AbilityScores(15, 13, 15, 8, 12, 10),  # CON 15 → +2
        )
        assert ruleset.compute_hp_max(ch) == 14  # d12 max(12) + 2

    def test_later_levels_use_average(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 5, True)], level=5,
            ability_scores=AbilityScores(15, 13, 15, 8, 12, 10),
        )
        # 12 (L1 max) + 4×7 (avg d12) + 5×2 (CON) = 50
        assert ruleset.compute_hp_max(ch) == 50

    def test_multiclass_first_level_of_starting_class_gets_max_die(self, ruleset):
        # Fighter 1 (primary, d10 max) / Wizard 1 (d6 avg 4); CON 14 → +2 per level.
        ch = _make_character(
            class_entries=[ClassEntry("fighter", 1, True), ClassEntry("wizard", 1, False)],
            level=2, ability_scores=AbilityScores(15, 13, 14, 13, 10, 10),
        )
        assert ruleset.compute_hp_max(ch) == 10 + 4 + 2 * 2  # 18


class TestConChangeHp:
    def test_asi_raising_con_modifier_bumps_hp_per_level(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 5, True)], level=5,
            ability_scores=AbilityScores(15, 13, 14, 8, 12, 10),  # CON 14 → +2
        )
        ch.hp_max, ch.hp_current = 44, 44
        ch.apply_asi({"constitution": 2}, ruleset=ruleset)  # CON 14→16, +1 mod → +5 HP
        assert ch.hp_max == 49 and ch.hp_current == 49

    def test_asi_without_con_change_leaves_hp(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 5, True)], level=5,
            ability_scores=AbilityScores(15, 13, 14, 8, 12, 10),
        )
        ch.hp_max = 44
        ch.apply_asi({"strength": 2}, ruleset=ruleset)
        assert ch.hp_max == 44


class TestEligibility:
    def test_subclass_becomes_available_at_subclass_level(self, ruleset):
        below = _make_character(class_entries=[ClassEntry("barbarian", 1, True)], level=1)
        at = _make_character(class_entries=[ClassEntry("barbarian", 3, True)], level=3)
        assert ruleset.can_pick_subclass(below, "barbarian") is False
        assert ruleset.can_pick_subclass(at, "barbarian") is True

    def test_multiclass_prereq_checks_both_classes(self, ruleset):
        # Barbarian (STR) with STR 15 but INT 8 can't multiclass into Wizard (INT); can into Fighter.
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 1, True)], level=1,
            ability_scores=AbilityScores(15, 13, 14, 8, 12, 10),
        )
        assert ruleset.can_add_class(ch, "wizard") is False
        assert ruleset.can_add_class(ch, "fighter") is True

    def test_recharge_cadence(self, ruleset):
        assert ruleset.resource_recharge("rage") == "long_rest"
        assert ruleset.resource_recharge("second_wind") == "short_rest"


class TestACMethods:
    def test_unarmored_default(self, ruleset):
        ch = _make_character(ability_scores=AbilityScores(10, 16, 10, 10, 10, 10))
        methods = {m["code"]: m["ac"] for m in ruleset.list_ac_methods(ch)}
        assert methods == {"unarmored": 13}  # 10 + Dex(+3)

    def test_barbarian_unarmored_defense(self, ruleset):
        ch = _make_character(
            class_entries=[ClassEntry("barbarian", 1, True)],
            ability_scores=AbilityScores(15, 14, 16, 8, 10, 10),
        )
        methods = {m["code"]: m["ac"] for m in ruleset.list_ac_methods(ch)}
        assert methods["unarmored"] == 12  # 10 + Dex(+2)
        assert methods["barbarian_unarmored_defense"] == 15  # 10 + Dex(+2) + Con(+3)
