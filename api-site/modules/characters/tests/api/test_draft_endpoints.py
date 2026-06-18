# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Draft lifecycle endpoint tests — create, step PATCH, finalize, discard."""

from uuid import uuid4

import pytest


@pytest.fixture
def owner(create_user):
    user = create_user("draft-owner@example.com")
    return user


@pytest.fixture
def other(create_user):
    return create_user("draft-other@example.com")


def _create_draft(client, auth_as, owner):
    auth_as(owner.id)
    response = client.post(
        "/api/characters/draft",
        json={"edition_code": "srd_5_2_1", "name": "Tester"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_sub_choice_picks_round_trip(client, auth_as, owner):
    """A.3/A.4 picks persist through the draft round-trip (save → reload)."""
    draft = _create_draft(client, auth_as, owner)
    cid = draft["id"]
    # Species sub-choices (Human size + skillful skill pick).
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "identity",
        "identity": {
            "species_code": "human",
            "sub_choices": {"size": ["small"], "skillful": ["arcana"]},
        },
    })
    # Class L1 sub-choices (Barbarian Weapon Mastery picks — stored faithfully).
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "class",
        "class": {
            "classes": [{
                "class_code": "barbarian", "level": 1, "is_primary": True,
                "chosen_skills": ["athletics", "perception"],
                "sub_choices": {"barbarian_weapon_mastery": ["greataxe", "handaxe"]},
            }],
        },
    })
    body = client.get(f"/api/characters/{cid}").json()
    assert body["species_sub_choices"] == {"size": ["small"], "skillful": ["arcana"]}
    assert body["size"] == "Small"  # chosen size override applied (deferral #6 resolved)
    entry = body["class_entries"][0]
    assert entry["class_code"] == "barbarian"
    assert entry["sub_choices"] == {"barbarian_weapon_mastery": ["greataxe", "handaxe"]}


def test_spell_selection_round_trip(client, auth_as, owner):
    """PR 6 (B.2/C.2): a Wizard's cantrip + level-1 picks persist and derive slots/DC."""
    draft = _create_draft(client, auth_as, owner)
    cid = draft["id"]
    # Wizard primary class.
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "class",
        "class": {
            "classes": [{
                "class_code": "wizard", "level": 1, "is_primary": True,
                "chosen_skills": ["arcana", "investigation"],
            }],
        },
    })
    # Bump Intelligence so the derived save DC is non-trivial (16 → +3 mod).
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "ability_scores",
        "ability_scores": {
            "strength": 8, "dexterity": 14, "constitution": 12,
            "intelligence": 16, "wisdom": 10, "charisma": 10,
        },
    })
    # Spell step: a cantrip + a level-1 spell, attributed to the wizard.
    resp = client.patch(f"/api/characters/draft/{cid}", json={
        "step": "spells",
        "spells": {"selections": [
            {"class_code": "wizard", "spell_codes": ["fire_bolt", "magic_missile"]},
        ]},
    })
    assert resp.status_code == 200, resp.text

    body = client.get(f"/api/characters/{cid}").json()
    spells = {s["spell_code"]: s for s in body["spells"]}
    assert set(spells) == {"fire_bolt", "magic_missile"}
    # Cantrip vs leveled classification + provenance.
    assert spells["fire_bolt"]["spell_level"] == 0
    assert spells["fire_bolt"]["source"] == "class_known"
    assert spells["magic_missile"]["spell_level"] == 1
    assert spells["magic_missile"]["source"] == "class_prepared"
    assert spells["magic_missile"]["granted_by"] == "wizard"
    assert spells["magic_missile"]["casting_ability"] == "intelligence"
    # Derived spellcasting: Wizard L1 → 2 first-level slots; DC 8+2+3=13, attack +5.
    derived = body["derived"]
    assert derived["spell_slots"] == {"1": 2}
    assert derived["spell_save_dc_by_ability"]["intelligence"] == 13
    assert derived["spell_attack_bonus_by_ability"]["intelligence"] == 5
    assert derived["pact_slots"] is None
    # creation_step advanced to spells so the wizard resumes correctly.
    assert body["creation_step"] == "spells"


def test_spell_selection_replaces_on_resave(client, auth_as, owner):
    """Re-saving the spell step replaces class picks (no stale accumulation)."""
    draft = _create_draft(client, auth_as, owner)
    cid = draft["id"]
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "class",
        "class": {"classes": [{
            "class_code": "wizard", "level": 1, "is_primary": True,
            "chosen_skills": ["arcana", "investigation"],
        }]},
    })
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "spells",
        "spells": {"selections": [{"class_code": "wizard", "spell_codes": ["fire_bolt", "shield"]}]},
    })
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "spells",
        "spells": {"selections": [{"class_code": "wizard", "spell_codes": ["mage_hand"]}]},
    })
    body = client.get(f"/api/characters/{cid}").json()
    assert {s["spell_code"] for s in body["spells"]} == {"mage_hand"}


def test_spell_step_invalid_class_preserves_existing(client, auth_as, owner):
    """validate-before-mutate: a bad class_code 400s and does NOT clear existing spells."""
    draft = _create_draft(client, auth_as, owner)
    cid = draft["id"]
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "class",
        "class": {"classes": [{
            "class_code": "wizard", "level": 1, "is_primary": True,
            "chosen_skills": ["arcana", "investigation"],
        }]},
    })
    client.patch(f"/api/characters/draft/{cid}", json={
        "step": "spells",
        "spells": {"selections": [{"class_code": "wizard", "spell_codes": ["fire_bolt"]}]},
    })
    # Barbarian isn't on the character → rejected, and the prior pick must survive.
    bad = client.patch(f"/api/characters/draft/{cid}", json={
        "step": "spells",
        "spells": {"selections": [{"class_code": "barbarian", "spell_codes": ["mage_hand"]}]},
    })
    assert bad.status_code == 400, bad.text
    body = client.get(f"/api/characters/{cid}").json()
    assert {s["spell_code"] for s in body["spells"]} == {"fire_bolt"}


def test_skill_granted_by_background_and_class_dedupes(client, auth_as, owner):
    """A skill granted by BOTH background and class collapses to one row.

    Regression: Soldier grants Athletics and Barbarian can pick Athletics. Saving the
    class step *after* the background step used to violate the (character_id, skill_code)
    unique constraint; the repository now soft-skips the duplicate (plan §D.1).
    """
    draft = _create_draft(client, auth_as, owner)
    cid = draft["id"]
    # Background first → BACKGROUND athletics.
    r1 = client.patch(f"/api/characters/draft/{cid}", json={
        "step": "background",
        "background": {
            "background_code": "soldier",
            "ability_increases": [
                {"ability": "strength", "increase": 2},
                {"ability": "constitution", "increase": 1},
            ],
        },
    })
    assert r1.status_code == 200, r1.text
    # Then the class picks Athletics too → CLASS athletics (the order that used to 500).
    r2 = client.patch(f"/api/characters/draft/{cid}", json={
        "step": "class",
        "class": {"classes": [{
            "class_code": "barbarian", "level": 1, "is_primary": True,
            "chosen_skills": ["athletics", "perception"],
        }]},
    })
    assert r2.status_code == 200, r2.text
    athletics = [s for s in r2.json()["skills"] if s["skill_code"] == "athletics"]
    assert len(athletics) == 1, f"expected one athletics row, got {athletics}"


class TestCreateDraft:
    def test_create_draft_returns_draft_response(self, client, auth_as, owner):
        body = _create_draft(client, auth_as, owner)
        assert body["is_draft"] is True
        assert body["edition_code"] == "srd_5_2_1"
        assert body["character_name"] == "Tester"
        assert body["creation_step"] == "edition"
        assert body["level"] == 1

    def test_unknown_edition_returns_400(self, client, auth_as, owner):
        auth_as(owner.id)
        response = client.post(
            "/api/characters/draft",
            json={"edition_code": "no_such_edition", "name": "X"},
        )
        assert response.status_code == 400

    def test_blank_name_rejected(self, client, auth_as, owner):
        auth_as(owner.id)
        response = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": ""},
        )
        assert response.status_code == 422


class TestUpdateDraftIdentity:
    def test_identity_step_applies_species_traits(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "identity",
                "identity": {
                    "species_code": "dwarf",
                    "chosen_languages": ["Giant"],
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["species_code"] == "dwarf"
        # Species defines size + speed + default languages; the chosen languages append.
        assert body["size"] == "Medium"
        assert body["speed"] >= 1
        assert "Giant" in body["languages"]
        assert body["creation_step"] == "identity"

    def test_unknown_species_returns_400(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "identity",
                "identity": {"species_code": "no_such_species"},
            },
        )
        assert response.status_code == 400


class TestUpdateDraftClass:
    def test_class_step_grants_saves_and_skills(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "class",
                "class": {
                    "classes": [
                        {
                            "class_code": "barbarian",
                            "level": 1,
                            "is_primary": True,
                            "chosen_skills": ["athletics", "perception"],
                        }
                    ]
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["level"] == 1
        assert len(body["class_entries"]) == 1
        assert body["class_entries"][0]["class_code"] == "barbarian"
        # Barbarian: STR + CON saves
        assert set(body["save_proficiencies"]) == {"strength", "constitution"}
        # The two chosen skills landed with source CLASS
        class_skills = {s["skill_code"] for s in body["skills"] if s["source"] == "CLASS"}
        assert class_skills == {"athletics", "perception"}

    def test_skill_outside_class_offer_rejected(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "class",
                "class": {
                    "classes": [
                        {
                            "class_code": "barbarian",
                            "level": 1,
                            "is_primary": True,
                            "chosen_skills": ["arcana"],  # not offered
                        }
                    ]
                },
            },
        )
        assert response.status_code == 400

    def test_wrong_skill_count_rejected(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "class",
                "class": {
                    "classes": [
                        {
                            "class_code": "barbarian",
                            "level": 1,
                            "is_primary": True,
                            "chosen_skills": ["athletics"],  # need 2
                        }
                    ]
                },
            },
        )
        assert response.status_code == 400


class TestUpdateDraftBackground:
    def _seed_to_class(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "class",
                "class": {
                    "classes": [
                        {
                            "class_code": "barbarian",
                            "level": 1,
                            "is_primary": True,
                            "chosen_skills": ["athletics", "perception"],
                        }
                    ]
                },
            },
        )
        return draft

    def test_background_grants_origin_feat_and_skill_profs(self, client, auth_as, owner):
        # Sage grants Arcana + History — neither overlaps with the Barbarian
        # class picks (athletics + perception) so both BACKGROUND-source rows land.
        draft = self._seed_to_class(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "background",
                "background": {
                    "background_code": "sage",
                    "ability_increases": [
                        {"ability": "constitution", "increase": 2},
                        {"ability": "intelligence", "increase": 1},
                    ],
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["background_code"] == "sage"
        feat_codes = [f["feat_code"] for f in body["feats"] if f["source"] == "BACKGROUND_ORIGIN"]
        assert len(feat_codes) == 1
        bg_skills = {s["skill_code"] for s in body["skills"] if s["source"] == "BACKGROUND"}
        assert bg_skills == {"arcana", "history"}

    def test_background_skill_overlap_with_class_is_silently_skipped(self, client, auth_as, owner):
        # Soldier grants Athletics + Intimidation. Athletics already comes from
        # the Barbarian class step, so only Intimidation should appear as a
        # BACKGROUND-source row (avoids the unique constraint).
        draft = self._seed_to_class(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "background",
                "background": {
                    "background_code": "soldier",
                    "ability_increases": [
                        {"ability": "strength", "increase": 2},
                        {"ability": "constitution", "increase": 1},
                    ],
                },
            },
        )
        assert response.status_code == 200, response.text
        body = response.json()
        bg_skills = {s["skill_code"] for s in body["skills"] if s["source"] == "BACKGROUND"}
        assert bg_skills == {"intimidation"}

    def test_invalid_ability_increase_pattern_rejected(self, client, auth_as, owner):
        draft = self._seed_to_class(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "background",
                "background": {
                    "background_code": "soldier",
                    "ability_increases": [
                        {"ability": "strength", "increase": 2},
                        {"ability": "constitution", "increase": 2},
                    ],
                },
            },
        )
        # Sum is 4, not 3 — server rejects.
        assert response.status_code == 400


class TestBackgroundBonusesSurviveAbilityScoresStep:
    """Regression: previously the background step baked bonuses into
    ability_scores, then the ability_scores step overwrote them and the
    bonus was lost. Now they're stored separately and the response
    surfaces final = base + bonus."""

    def _seed_to_background(self, client, auth_as, owner):
        auth_as(owner.id)
        draft = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": "BonusTest"},
        ).json()
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "class",
            "class": {"classes": [{
                "class_code": "barbarian", "level": 1, "is_primary": True,
                "chosen_skills": ["athletics", "perception"],
            }]},
        })
        # Sage grants Constitution / Intelligence / Wisdom as the three
        # offered abilities. Pick +2 CON / +1 INT.
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "background",
            "background": {
                "background_code": "sage",
                "ability_increases": [
                    {"ability": "constitution", "increase": 2},
                    {"ability": "intelligence", "increase": 1},
                ],
            },
        })
        return draft

    def test_background_bonuses_survive_ability_scores_overwrite(
        self, client, auth_as, owner
    ):
        draft = self._seed_to_background(client, auth_as, owner)
        # Player picks raw scores via manual/point-buy/whatever — server stores BASE.
        response = client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "ability_scores",
            "ability_scores": {
                "strength": 15, "dexterity": 13, "constitution": 14,
                "intelligence": 12, "wisdom": 10, "charisma": 8,
            },
        })
        assert response.status_code == 200, response.text
        body = response.json()
        # Bonuses surface as a separate dict.
        assert body["origin_ability_bonuses"] == {"constitution": 2, "intelligence": 1}
        # ability_scores in the response is FINAL (base + bonus).
        assert body["ability_scores"]["constitution"] == 16  # 14 base + 2
        assert body["ability_scores"]["intelligence"] == 13  # 12 base + 1
        # Untouched abilities have no bonus.
        assert body["ability_scores"]["strength"] == 15

    def test_switching_modes_doesnt_lose_bonuses(self, client, auth_as, owner):
        # Mirror the user-reported bug: roll dice gives one set, then the
        # player re-saves (a different mode would send a different payload).
        # Bonuses must persist either way.
        draft = self._seed_to_background(client, auth_as, owner)
        # First save: rolled values
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "ability_scores",
            "ability_scores": {
                "strength": 16, "dexterity": 14, "constitution": 12,
                "intelligence": 10, "wisdom": 13, "charisma": 8,
            },
        })
        # Second save: different (point-buy-style) values
        response = client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "ability_scores",
            "ability_scores": {
                "strength": 15, "dexterity": 13, "constitution": 14,
                "intelligence": 12, "wisdom": 10, "charisma": 8,
            },
        })
        body = response.json()
        # Bonuses still there after multiple ability_scores writes.
        assert body["origin_ability_bonuses"] == {"constitution": 2, "intelligence": 1}
        assert body["ability_scores"]["constitution"] == 16
        assert body["ability_scores"]["intelligence"] == 13


class TestRename:
    """``rename`` is a tiny name-only step bound to the persistent name
    header in the wizard. It doesn't bump creation_step."""

    def test_rename_updates_name_without_touching_creation_step(self, client, auth_as, owner):
        auth_as(owner.id)
        draft = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": "Old Name"},
        ).json()
        original_step = draft["creation_step"]

        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={"step": "rename", "rename": {"name": "New Name"}},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["character_name"] == "New Name"
        # rename is orthogonal to wizard step progression.
        assert body["creation_step"] == original_step

    def test_blank_name_rejected(self, client, auth_as, owner):
        auth_as(owner.id)
        draft = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": "Solid"},
        ).json()
        # Empty string fails the schema's min_length=1 → 422.
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={"step": "rename", "rename": {"name": ""}},
        )
        assert response.status_code == 422
        # Whitespace-only passes min_length but the handler strips + rejects → 400.
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={"step": "rename", "rename": {"name": "   "}},
        )
        assert response.status_code == 400

    def test_only_owner_can_rename(self, client, auth_as, owner, other):
        auth_as(owner.id)
        draft = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": "Mine"},
        ).json()
        auth_as(other.id)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={"step": "rename", "rename": {"name": "Hijacked"}},
        )
        assert response.status_code == 403


class TestFinalize:
    def _seed_complete(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "identity",
            "identity": {"species_code": "dwarf"},
        })
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "class",
            "class": {
                "classes": [
                    {
                        "class_code": "barbarian", "level": 1, "is_primary": True,
                        "chosen_skills": ["athletics", "perception"],
                    }
                ]
            },
        })
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "background",
            "background": {
                "background_code": "soldier",
                "ability_increases": [
                    {"ability": "strength", "increase": 2},
                    {"ability": "constitution", "increase": 1},
                ],
            },
        })
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "ability_scores",
            "ability_scores": {
                "strength": 15, "dexterity": 13, "constitution": 14,
                "intelligence": 8, "wisdom": 12, "charisma": 10,
            },
        })
        client.patch(f"/api/characters/draft/{draft['id']}", json={
            "step": "hp_ac",
            "hp_ac": {"hp_max": 14, "ac": 14},
        })
        return draft

    def test_finalize_flips_is_draft(self, client, auth_as, owner):
        draft = self._seed_complete(client, auth_as, owner)
        response = client.post(f"/api/characters/draft/{draft['id']}/finalize")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["is_draft"] is False
        assert body["creation_step"] is None
        assert body["hp_max"] == 14

    def test_finalize_incomplete_returns_400(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.post(f"/api/characters/draft/{draft['id']}/finalize")
        assert response.status_code == 400


class TestAuthorization:
    def test_only_owner_can_update_draft(self, client, auth_as, owner, other):
        draft = _create_draft(client, auth_as, owner)
        auth_as(other.id)
        response = client.patch(
            f"/api/characters/draft/{draft['id']}",
            json={
                "step": "identity",
                "identity": {"species_code": "human"},
            },
        )
        assert response.status_code == 403

    def test_only_owner_can_discard_draft(self, client, auth_as, owner, other):
        draft = _create_draft(client, auth_as, owner)
        auth_as(other.id)
        response = client.delete(f"/api/characters/draft/{draft['id']}")
        assert response.status_code == 403


class TestDiscard:
    def test_discard_removes_draft(self, client, auth_as, owner):
        draft = _create_draft(client, auth_as, owner)
        response = client.delete(f"/api/characters/draft/{draft['id']}")
        assert response.status_code == 204
        # Subsequent GET should 404
        response = client.get(f"/api/characters/{draft['id']}")
        assert response.status_code == 404

    def test_discard_unknown_id_returns_404(self, client, auth_as, owner):
        auth_as(owner.id)
        response = client.delete(f"/api/characters/draft/{uuid4()}")
        assert response.status_code == 404
