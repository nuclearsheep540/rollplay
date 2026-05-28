# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Runtime + level-up endpoint tests."""

from uuid import uuid4

import pytest


def _finalize_a_character(client, auth_as, owner):
    """Walk a draft all the way through finalize and return the response body."""
    auth_as(owner.id)
    create = client.post(
        "/api/characters/draft",
        json={"edition_code": "srd_5_2_1", "name": "Runner"},
    )
    draft = create.json()
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "identity",
        "identity": {"species_code": "human"},
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
    final = client.post(f"/api/characters/draft/{draft['id']}/finalize")
    return final.json()


@pytest.fixture
def owner(create_user):
    return create_user("runtime-owner@example.com")


@pytest.fixture
def other(create_user):
    return create_user("runtime-other@example.com")


class TestRuntimeUpdate:
    def test_take_damage_via_hp_decrease(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"hp_current": 8},
        )
        assert response.status_code == 200, response.text
        assert response.json()["hp_current"] == 8

    def test_temp_hp_set(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"hp_temp": 5},
        )
        assert response.json()["hp_temp"] == 5

    def test_award_xp(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"xp": 500},
        )
        body = response.json()
        assert body["xp"] == 500
        # 500 is past 300 (level 2 threshold) but below 900 (level 3)
        assert body["derived"]["pending_level_up"] is True

    def test_status_effects_replaced_atomically(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"status_effects": ["Poisoned", "Frightened"]},
        )
        assert response.json()["status_effects"] == ["Poisoned", "Frightened"]
        # Replacing again drops the first list entirely
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"status_effects": ["Blessed"]},
        )
        assert response.json()["status_effects"] == ["Blessed"]

    def test_inspiration_toggle(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"inspiration": True},
        )
        assert response.json()["inspiration"] is True

    def test_empty_body_rejected(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.patch(f"/api/characters/{char['id']}/runtime", json={})
        assert response.status_code == 400

    def test_only_owner_can_edit_runtime(self, client, auth_as, owner, other):
        char = _finalize_a_character(client, auth_as, owner)
        auth_as(other.id)
        response = client.patch(
            f"/api/characters/{char['id']}/runtime",
            json={"hp_current": 1},
        )
        assert response.status_code == 403


class TestLevelUpPreview:
    def test_preview_returns_class_options(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.get(f"/api/characters/{char['id']}/level-up")
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["current_level"] == 1
        assert body["target_level"] == 2
        assert body["available_classes"] == ["barbarian"]
        assert body["is_asi_level"] == {"barbarian": False}
        hp_opts = body["hp_options"]["barbarian"]
        # Barbarian d12, CON 15 → +2: average=(12/2+1)+2=9, max=14
        assert hp_opts == {"average": 9, "max_roll": 14}


class TestLevelUpApply:
    def test_apply_level_up_average_hp(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        # Bump XP enough to be eligible
        client.patch(f"/api/characters/{char['id']}/runtime", json={"xp": 400})
        response = client.post(
            f"/api/characters/{char['id']}/level-up",
            json={"class_code": "barbarian", "hp_choice": "average"},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        assert body["level"] == 2
        assert body["class_entries"][0]["level"] == 2
        # HP gained = 9 (avg) → 14 + 9 = 23
        assert body["hp_max"] == 23

    def test_apply_level_up_with_roll(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        client.patch(f"/api/characters/{char['id']}/runtime", json={"xp": 400})
        response = client.post(
            f"/api/characters/{char['id']}/level-up",
            json={"class_code": "barbarian", "hp_choice": "roll", "roll_value": 10},
        )
        assert response.status_code == 200, response.text
        body = response.json()
        # 14 + (10 + CON +2) = 26
        assert body["hp_max"] == 26

    def test_roll_higher_than_hit_die_rejected(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        client.patch(f"/api/characters/{char['id']}/runtime", json={"xp": 400})
        response = client.post(
            f"/api/characters/{char['id']}/level-up",
            json={"class_code": "barbarian", "hp_choice": "roll", "roll_value": 13},
        )
        assert response.status_code == 400

    def test_level_up_without_xp_eligibility_rejected(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        # XP = 0 from finalize; not eligible
        response = client.post(
            f"/api/characters/{char['id']}/level-up",
            json={"class_code": "barbarian", "hp_choice": "average"},
        )
        assert response.status_code == 400


class TestListMe:
    def test_list_me_returns_owner_characters(self, client, auth_as, owner):
        _finalize_a_character(client, auth_as, owner)
        # Also create a draft so we know listing returns both
        client.post("/api/characters/draft", json={
            "edition_code": "srd_5_2_1", "name": "Second",
        })
        response = client.get("/api/characters/me")
        assert response.status_code == 200
        body = response.json()
        names = {c["character_name"] for c in body}
        assert {"Runner", "Second"}.issubset(names)


class TestDeleteCharacter:
    def test_owner_can_delete_finalised(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.delete(f"/api/characters/{char['id']}")
        assert response.status_code == 204
        # GET should now 404 (soft-deleted rows hidden from reads).
        assert client.get(f"/api/characters/{char['id']}").status_code == 404

    def test_non_owner_forbidden(self, client, auth_as, owner, other):
        char = _finalize_a_character(client, auth_as, owner)
        auth_as(other.id)
        response = client.delete(f"/api/characters/{char['id']}")
        assert response.status_code == 403

    def test_unknown_id_returns_404(self, client, auth_as, owner):
        auth_as(owner.id)
        response = client.delete(f"/api/characters/{uuid4()}")
        assert response.status_code == 404

    def test_delete_draft_via_finalised_endpoint_rejected(self, client, auth_as, owner):
        # Drafts must go through /draft/{id} — the finalised endpoint refuses
        # so the caller can't bypass the discard contract.
        auth_as(owner.id)
        create = client.post(
            "/api/characters/draft",
            json={"edition_code": "srd_5_2_1", "name": "Draft only"},
        )
        draft_id = create.json()["id"]
        response = client.delete(f"/api/characters/{draft_id}")
        assert response.status_code == 400


class TestGetCharacter:
    def test_owner_can_get(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)
        response = client.get(f"/api/characters/{char['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == char["id"]

    def test_non_owner_forbidden(self, client, auth_as, owner, other):
        char = _finalize_a_character(client, auth_as, owner)
        auth_as(other.id)
        response = client.get(f"/api/characters/{char['id']}")
        assert response.status_code == 403

    def test_unknown_id_returns_404(self, client, auth_as, owner):
        auth_as(owner.id)
        response = client.get(f"/api/characters/{uuid4()}")
        assert response.status_code == 404
