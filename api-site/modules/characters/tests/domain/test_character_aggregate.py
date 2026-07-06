# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Aggregate behaviour tests — vitals, death saves, level-up, skills, draft."""

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


def _make(**overrides) -> CharacterAggregate:
    now = datetime.utcnow()
    defaults = dict(
        id=uuid4(),
        user_id=uuid4(),
        edition_id=1,
        edition_code="srd_5_2_1",
        active_campaign=None,
        character_name="Test",
        species_code="human",
        background_code="soldier",
        class_entries=[ClassEntry("fighter", 1, True)],
        ability_scores=AbilityScores.default(),
        origin_ability_bonuses={},
        save_proficiencies=frozenset(),
        skills=[],
        feats=[],
        level=1,
        xp=0,
        hp_max=20,
        hp_current=20,
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


class TestDraftAndFinalize:
    def test_create_draft_populates_minimum_fields(self):
        uid = uuid4()
        c = CharacterAggregate.create_draft(user_id=uid, edition_id=1, edition_code="srd_5_2_1", character_name="Draft")
        assert c.is_draft is True
        assert c.creation_step == "edition"
        assert c.user_id == uid
        assert c.character_name == "Draft"
        assert c.species_code == ""
        assert c.class_entries == []

    def test_create_draft_rejects_blank_name(self):
        with pytest.raises(ValueError, match="required"):
            CharacterAggregate.create_draft(user_id=uuid4(), edition_id=1, edition_code="srd_5_2_1", character_name="   ")

    def test_finalize_fails_with_missing_fields(self):
        c = CharacterAggregate.create_draft(user_id=uuid4(), edition_id=1, edition_code="srd_5_2_1", character_name="Draft")
        with pytest.raises(ValueError, match="species_code"):
            c.finalize()

    def test_finalize_succeeds_when_complete(self):
        c = CharacterAggregate.create_draft(user_id=uuid4(), edition_id=1, edition_code="srd_5_2_1", character_name="Done")
        c.species_code = "human"
        c.background_code = "soldier"
        c.class_entries = [ClassEntry("fighter", 1, True)]
        c.hp_max = 10
        c.finalize()
        assert c.is_draft is False
        assert c.creation_step is None


class TestVitals:
    def test_take_damage_reduces_hp(self):
        c = _make(hp_current=20, hp_max=20)
        c.take_damage(5)
        assert c.hp_current == 15

    def test_temp_hp_absorbs_first(self):
        c = _make(hp_current=20, hp_temp=5)
        c.take_damage(3)
        assert c.hp_temp == 2
        assert c.hp_current == 20

    def test_damage_through_temp_hp(self):
        c = _make(hp_current=20, hp_temp=3)
        c.take_damage(7)
        assert c.hp_temp == 0
        assert c.hp_current == 16

    def test_damage_to_zero_caps_at_zero(self):
        c = _make(hp_current=5)
        c.take_damage(100)
        assert c.hp_current == 0

    def test_heal_caps_at_hp_max(self):
        c = _make(hp_current=10, hp_max=20)
        c.heal(50)
        assert c.hp_current == 20

    def test_heal_from_zero_resets_death_saves(self):
        c = _make(hp_current=0, death_save_successes=2, death_save_failures=1, is_alive=True)
        c.heal(5)
        assert c.death_save_successes == 0
        assert c.death_save_failures == 0
        assert c.hp_current == 5
        assert c.is_alive is True

    def test_set_temp_hp_replaces_does_not_stack(self):
        # 5e rule: temp HP doesn't stack.
        c = _make(hp_temp=8)
        c.set_temp_hp(3)
        assert c.hp_temp == 3


class TestDeathSaves:
    def test_three_successes_stabilise(self):
        c = _make(hp_current=0)
        c.roll_death_save_success()
        c.roll_death_save_success()
        c.roll_death_save_success()
        # Counters reset after stabilising at 0 HP.
        assert c.death_save_successes == 0
        assert c.death_save_failures == 0
        assert c.is_alive is True

    def test_three_failures_kill(self):
        c = _make(hp_current=0)
        c.roll_death_save_failure()
        c.roll_death_save_failure()
        c.roll_death_save_failure()
        assert c.is_alive is False
        assert c.hp_current == 0


class TestStatusAndInspiration:
    def test_add_status_dedupes(self):
        c = _make()
        c.add_status("Poisoned")
        c.add_status("Poisoned")
        assert c.status_effects == ["Poisoned"]

    def test_remove_status_noop_if_absent(self):
        c = _make(status_effects=["Poisoned"])
        c.remove_status("Frightened")
        assert c.status_effects == ["Poisoned"]

    def test_add_status_strips_whitespace_and_rejects_empty(self):
        c = _make()
        c.add_status("  Frightened  ")
        assert c.status_effects == ["Frightened"]
        with pytest.raises(ValueError):
            c.add_status("   ")

    def test_set_inspiration(self):
        c = _make()
        c.set_inspiration(True)
        assert c.inspiration is True


class TestXpAndLeveling:
    def test_award_xp_accumulates(self):
        c = _make(xp=100)
        c.award_xp(250)
        assert c.xp == 350

    def test_apply_level_gain_bumps_class_and_total(self):
        c = _make(level=4, hp_max=30, hp_current=20)
        c.apply_level_gain(class_code="fighter", hp_gained=6)
        assert c.level == 5
        assert c.class_entries[0].level == 2
        assert c.hp_max == 36
        assert c.hp_current == 26

    def test_apply_level_gain_preserves_choice_records(self):
        # Regression: skills are a projection of ClassEntry.chosen_skills, so a level bump must
        # NOT drop chosen_skills / sub_choices (else L1 skills silently vanish on level-up).
        c = _make(
            level=2,
            class_entries=[ClassEntry("barbarian", 2, True,
                                      {"barbarian_weapon_mastery": ["greataxe"]},
                                      ["athletics", "perception"])],
        )
        c.apply_level_gain(class_code="barbarian", hp_gained=7)
        entry = c.class_entries[0]
        assert entry.level == 3
        assert entry.chosen_skills == ["athletics", "perception"]
        assert entry.sub_choices == {"barbarian_weapon_mastery": ["greataxe"]}

    def test_apply_level_gain_caps_at_level_20(self):
        c = _make(level=20)
        with pytest.raises(ValueError, match="max level"):
            c.apply_level_gain(class_code="fighter", hp_gained=5)

    def test_apply_level_gain_rejects_unknown_class(self):
        c = _make()
        with pytest.raises(ValueError, match="multi-classing"):
            c.apply_level_gain(class_code="wizard", hp_gained=5)

    def test_add_class_promotes_to_multiclass(self):
        c = _make(level=3, class_entries=[ClassEntry("fighter", 3, True)])
        c.add_class("rogue")
        assert c.level == 4
        assert len(c.class_entries) == 2
        rogue = next(e for e in c.class_entries if e.class_code == "rogue")
        assert rogue.level == 1

    def test_add_class_demotion_preserves_choice_records(self):
        # Demoting a primary when multiclassing must keep its chosen_skills / sub_choices.
        c = _make(level=3, class_entries=[
            ClassEntry("fighter", 3, True, {"fighter_fighting_style": ["defense"]}, ["athletics", "intimidation"]),
        ])
        c.add_class("rogue", is_primary=True)
        fighter = next(e for e in c.class_entries if e.class_code == "fighter")
        assert fighter.is_primary is False
        assert fighter.chosen_skills == ["athletics", "intimidation"]
        assert fighter.sub_choices == {"fighter_fighting_style": ["defense"]}

    def test_add_class_blocks_duplicate(self):
        c = _make()
        with pytest.raises(ValueError, match="already has"):
            c.add_class("fighter")


class TestSubclass:
    def test_pick_subclass_records_choice(self):
        c = _make(level=3, class_entries=[ClassEntry("barbarian", 3, True)])
        c.pick_subclass("barbarian", "path_of_the_berserker", at_level=3)
        assert len(c.subclasses) == 1
        entry = c.subclasses[0]
        assert entry.class_code == "barbarian"
        assert entry.subclass_code == "path_of_the_berserker"
        assert entry.chosen_at_level == 3

    def test_pick_subclass_replaces_on_repick(self):
        c = _make(level=3, class_entries=[ClassEntry("cleric", 3, True)])
        c.pick_subclass("cleric", "life_domain")
        c.pick_subclass("cleric", "life_domain", at_level=3)  # re-pick same class → one row
        assert len(c.subclasses) == 1

    def test_pick_subclass_requires_the_class(self):
        c = _make(class_entries=[ClassEntry("fighter", 1, True)])
        with pytest.raises(ValueError, match="no class"):
            c.pick_subclass("wizard", "evoker")


class TestAsi:
    def test_apply_asi_two_into_one_ability(self):
        c = _make(ability_scores=AbilityScores(10, 14, 12, 10, 10, 10))
        c.apply_asi({"strength": 2})
        assert c.ability_scores.strength == 12

    def test_apply_asi_one_one(self):
        c = _make(ability_scores=AbilityScores(10, 14, 12, 10, 10, 10))
        c.apply_asi({"strength": 1, "constitution": 1})
        assert c.ability_scores.strength == 11
        assert c.ability_scores.constitution == 13

    def test_apply_asi_rejects_wrong_total(self):
        c = _make()
        with pytest.raises(ValueError, match="exactly 2"):
            c.apply_asi({"strength": 1})

    def test_apply_asi_caps_at_twenty(self):
        c = _make(ability_scores=AbilityScores(20, 10, 10, 10, 10, 10))
        with pytest.raises(ValueError, match="above 20"):
            c.apply_asi({"strength": 2})


class TestSkillsAndSaves:
    def test_add_skill_proficiency_dedupes(self):
        c = _make()
        c.add_skill_proficiency("athletics", "CLASS")
        c.add_skill_proficiency("athletics", "CLASS")
        assert len(c.skills) == 1

    def test_add_skill_replaces_with_different_source(self):
        c = _make()
        c.add_skill_proficiency("athletics", "CLASS")
        c.add_skill_proficiency("athletics", "FEAT", expertise=True)
        assert len(c.skills) == 1
        assert c.skills[0].source == "FEAT"
        assert c.skills[0].expertise is True

    def test_remove_skill(self):
        c = _make(skills=[SkillProficiency("athletics", "CLASS")])
        c.remove_skill_proficiency("athletics")
        assert c.skills == []

    def test_set_save_proficiencies(self):
        c = _make()
        c.set_save_proficiencies({"strength", "constitution"})
        assert c.save_proficiencies == frozenset({"strength", "constitution"})

    def test_invalid_save_ability_rejected(self):
        c = _make()
        with pytest.raises(KeyError):
            c.set_save_proficiencies({"strength", "wisdomx"})


class TestLockingAndDeletion:
    def test_lock_then_unlock(self):
        c = _make()
        cid = uuid4()
        c.lock_to_campaign(cid)
        assert c.active_campaign == cid
        assert c.is_locked() is True
        c.unlock_from_campaign()
        assert c.active_campaign is None

    def test_cannot_delete_when_locked(self):
        c = _make()
        c.lock_to_campaign(uuid4())
        assert c.can_be_deleted() is False

    def test_double_lock_raises(self):
        c = _make()
        c.lock_to_campaign(uuid4())
        with pytest.raises(ValueError, match="already locked"):
            c.lock_to_campaign(uuid4())


class TestCurrencyAndInventoryReplace:
    """Whole-map / whole-list replace used by the runtime PATCH (J.2/J.3)."""

    OLD = datetime(2000, 1, 1)

    def test_replace_currency_drops_absent_coins(self):
        c = _make(currency={"gp": 3, "sp": 10})
        c.replace_currency({"gp": 5})
        assert c.currency == {"gp": 5}  # sp dropped by whole-map replace

    def test_replace_currency_refreshes_timestamp(self):
        c = _make(currency={"gp": 3})
        c.updated_at = self.OLD
        c.replace_currency({"gp": 5})
        assert c.updated_at > self.OLD

    def test_replace_currency_empty_map_refreshes_timestamp(self):
        c = _make(currency={"gp": 3})
        c.updated_at = self.OLD
        c.replace_currency({})  # clearing all coins must still touch
        assert c.currency == {}
        assert c.updated_at > self.OLD

    def test_replace_inventory_drops_absent_items(self):
        c = _make()
        c.replace_inventory([{"item_code": "rope", "quantity": 2}])
        c.replace_inventory([{"item_code": "torch", "quantity": 5}])
        assert [i.item_code for i in c.inventory] == ["torch"]
        assert c.inventory[0].quantity == 5

    def test_replace_inventory_defaults_quantity_and_notes(self):
        c = _make()
        c.replace_inventory([{"item_code": "rope"}])
        assert c.inventory[0].quantity == 1
        assert c.inventory[0].notes == ""

    def test_replace_inventory_empty_list_refreshes_timestamp(self):
        c = _make()
        c.replace_inventory([{"item_code": "rope"}])
        c.updated_at = self.OLD
        c.replace_inventory([])  # clearing inventory must still touch
        assert c.inventory == []
        assert c.updated_at > self.OLD
