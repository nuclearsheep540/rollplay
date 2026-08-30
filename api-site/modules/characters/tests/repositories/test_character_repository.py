# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""End-to-end repository round-trips via the in-memory SQLite fixture.

Confirms the v2 schema persists every field group (vitals, class entries,
ability scores, save profs, skill profs, feat acquisitions) and that
``save`` then ``get_by_id`` returns an equivalent aggregate.
"""

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


def _make(user_id, edition_id, **overrides) -> CharacterAggregate:
    now = datetime.utcnow()
    defaults = dict(
        id=None,
        user_id=user_id,
        edition_id=edition_id,
        edition_code="srd_5_2_1",
        active_campaign=None,
        character_name="Rolfin",
        species_code="dwarf",
        background_code="soldier",
        class_entries=[
            ClassEntry("fighter", 3, True),
            ClassEntry("rogue", 2, False),
        ],
        ability_scores=AbilityScores(16, 12, 14, 10, 13, 8),
        origin_ability_bonuses={},
        save_proficiencies=frozenset({"strength", "constitution"}),
        skills=[
            SkillProficiency("athletics", "CLASS"),
            SkillProficiency("perception", "BACKGROUND", expertise=True),
        ],
        feats=[
            FeatAcquisition("savage_attacker", 1, "BACKGROUND_ORIGIN"),
            FeatAcquisition("alert", 4, "ASI"),
        ],
        level=5,
        xp=6500,
        hp_max=42,
        hp_current=42,
        hp_temp=0,
        ac=16,
        death_save_successes=0,
        death_save_failures=0,
        inspiration=False,
        status_effects=["Poisoned"],
        is_alive=True,
        speed=25,
        size="Medium",
        languages=["Common", "Dwarvish"],
        is_draft=False,
        creation_step=None,
        created_at=now,
        updated_at=now,
        slot=0,
    )
    defaults.update(overrides)
    return CharacterAggregate(**defaults)


class TestSaveAndGet:
    def test_round_trip_preserves_every_field(self, character_repo, create_user, seed_default_edition):
        user = create_user("rolfin@example.com")
        original = _make(user.id, seed_default_edition)
        character_repo.save(original)
        assert original.id is not None

        fetched = character_repo.get_by_id(original.id)
        assert fetched is not None
        assert fetched.character_name == "Rolfin"
        assert fetched.species_code == "dwarf"
        assert fetched.background_code == "soldier"
        assert fetched.level == 5
        assert fetched.xp == 6500
        assert fetched.hp_max == 42
        assert fetched.ac == 16
        assert fetched.size == "Medium"
        assert fetched.speed == 25
        assert sorted(fetched.languages) == ["Common", "Dwarvish"]
        assert fetched.status_effects == ["Poisoned"]
        assert fetched.is_draft is False

        assert sorted(e.class_code for e in fetched.class_entries) == ["fighter", "rogue"]
        primary = next(e for e in fetched.class_entries if e.is_primary)
        assert primary.class_code == "fighter"
        assert primary.level == 3

        assert fetched.ability_scores.strength == 16
        assert fetched.ability_scores.charisma == 8

        assert fetched.save_proficiencies == frozenset({"strength", "constitution"})

        skill_map = {s.skill_code: s for s in fetched.skills}
        assert skill_map["athletics"].source == "CLASS"
        assert skill_map["athletics"].expertise is False
        assert skill_map["perception"].source == "BACKGROUND"
        assert skill_map["perception"].expertise is True

        feat_map = {f.feat_code: f for f in fetched.feats}
        assert feat_map["savage_attacker"].source == "BACKGROUND_ORIGIN"
        assert feat_map["savage_attacker"].level == 1
        assert feat_map["alert"].source == "ASI"
        assert feat_map["alert"].level == 4

    def test_save_then_update_replaces_children_cleanly(self, character_repo, create_user, seed_default_edition):
        user = create_user("update@example.com")
        c = _make(user.id, seed_default_edition)
        character_repo.save(c)

        # Replace class entries; the old fighter+rogue rows should be deleted.
        c.class_entries = [ClassEntry("wizard", 5, True)]
        c.skills = []
        c.feats = []
        c.save_proficiencies = frozenset()
        character_repo.save(c)

        fetched = character_repo.get_by_id(c.id)
        assert len(fetched.class_entries) == 1
        assert fetched.class_entries[0].class_code == "wizard"
        assert fetched.skills == []
        assert fetched.feats == []
        assert fetched.save_proficiencies == frozenset()


class TestQueries:
    def test_get_by_user_id_orders_by_updated_at_desc(self, character_repo, create_user, seed_default_edition):
        user = create_user("two@example.com")
        first = _make(user.id, seed_default_edition, character_name="First", slot=0)
        character_repo.save(first)
        second = _make(user.id, seed_default_edition, character_name="Second", slot=1)
        character_repo.save(second)

        results = character_repo.get_by_user_id(user.id)
        assert [c.character_name for c in results] == ["Second", "First"]

    def test_get_by_active_campaign(self, character_repo, create_user, seed_default_edition):
        user = create_user("camp@example.com")
        campaign_id = uuid4()
        attached = _make(user.id, seed_default_edition, character_name="Attached")
        attached.lock_to_campaign(campaign_id)
        character_repo.save(attached)

        unattached = _make(user.id, seed_default_edition, character_name="Unattached", slot=1)
        character_repo.save(unattached)

        results = character_repo.get_by_active_campaign(campaign_id)
        assert len(results) == 1
        assert results[0].character_name == "Attached"

    def test_get_user_character_for_campaign_returns_only_locked_one(
        self, character_repo, create_user, seed_default_edition
    ):
        user_a = create_user("a@example.com")
        user_b = create_user("b@example.com")
        campaign_id = uuid4()

        a_char = _make(user_a.id, seed_default_edition, character_name="A")
        a_char.lock_to_campaign(campaign_id)
        character_repo.save(a_char)

        b_char = _make(user_b.id, seed_default_edition, character_name="B")
        b_char.lock_to_campaign(campaign_id)
        character_repo.save(b_char)

        result = character_repo.get_user_character_for_campaign(user_a.id, campaign_id)
        assert result is not None
        assert result.character_name == "A"


class TestDelete:
    def test_soft_delete_hides_from_get_by_id(self, character_repo, create_user, seed_default_edition):
        user = create_user("delete@example.com")
        c = _make(user.id, seed_default_edition)
        character_repo.save(c)
        assert character_repo.delete(c.id) is True
        assert character_repo.get_by_id(c.id) is None

    def test_delete_blocked_when_locked(self, character_repo, create_user, seed_default_edition):
        user = create_user("locked@example.com")
        c = _make(user.id, seed_default_edition)
        c.lock_to_campaign(uuid4())
        character_repo.save(c)
        with pytest.raises(ValueError, match="locked"):
            character_repo.delete(c.id)


class TestSlotVisibility:
    """Capacity slots: the roster shows only slots below the user's max_slots."""

    def test_shrunk_max_slots_hides_high_slot_characters(
        self, character_repo, user_repo, create_user, seed_default_edition
    ):
        user = create_user("slots-owner@example.com")
        for slot_number in range(3):
            character_repo.save(_make(
                user.id, seed_default_edition,
                character_name=f"Slotted {slot_number}", slot=slot_number,
            ))

        assert len(character_repo.get_by_user_id(user.id)) == 3

        user.set_max_slots(2)
        user_repo.save(user)

        visible = character_repo.get_by_user_id(user.id)
        assert len(visible) == 2
        assert all(character.slot < 2 for character in visible)

        # Nothing was deleted — raising capacity brings them back.
        user.set_max_slots(4)
        user_repo.save(user)
        assert len(character_repo.get_by_user_id(user.id)) == 3

    def test_soft_delete_frees_the_slot(
        self, character_repo, create_user, seed_default_edition
    ):
        user = create_user("slots-free@example.com")
        character_id = character_repo.save(_make(
            user.id, seed_default_edition, character_name="Doomed", slot=0,
        ))

        assert character_repo.get_occupied_slots(user.id) == [0]
        character_repo.delete(character_id)
        assert character_repo.get_occupied_slots(user.id) == []
