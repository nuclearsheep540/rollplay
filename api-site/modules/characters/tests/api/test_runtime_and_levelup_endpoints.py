# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Runtime + level-up endpoint tests."""

import json
from pathlib import Path
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

    def test_resource_pool_derived_and_spent_round_trip(self, client, auth_as, owner):
        """PR 7 (B.3/C.4): Barbarian rage pool derives full, then a spent count round-trips."""
        char = _finalize_a_character(client, auth_as, owner)  # Barbarian L1 → rage pool (max 2)
        cid = char["id"]
        pools = {p["pool_code"]: p for p in char["derived"]["resource_pools"]}
        assert pools["rage"]["max_value"] == 2
        assert pools["rage"]["current_value"] == 0  # full at creation (nothing spent)
        assert pools["rage"]["recharge"] == "long_rest"
        # Barbarian also exposes the Unarmored Defense AC method.
        ac_codes = {m["code"] for m in char["derived"]["ac_methods"]}
        assert {"unarmored", "barbarian_unarmored_defense"} <= ac_codes
        # Spend one rage through the runtime PATCH; it persists + the derived pool reflects it.
        resp = client.patch(f"/api/characters/{cid}/runtime", json={
            "resource_usage": [{"pool_code": "rage", "current_value": 1}],
        })
        assert resp.status_code == 200, resp.text
        body = client.get(f"/api/characters/{cid}").json()
        assert {r["pool_code"]: r["current_value"] for r in body["resource_usage"]} == {"rage": 1}
        rage = next(p for p in body["derived"]["resource_pools"] if p["pool_code"] == "rage")
        assert rage["max_value"] == 2 and rage["current_value"] == 1

    def test_exhaustion_round_trip_and_clamped(self, client, auth_as, owner):
        """PR 11 (G.3): exhaustion level persists via the runtime PATCH and is clamped 0–6."""
        char = _finalize_a_character(client, auth_as, owner)
        cid = char["id"]
        assert char["exhaustion_level"] == 0
        r = client.patch(f"/api/characters/{cid}/runtime", json={"exhaustion_level": 3})
        assert r.status_code == 200 and r.json()["exhaustion_level"] == 3
        # Out-of-range is rejected by the schema (le=6).
        assert client.patch(f"/api/characters/{cid}/runtime", json={"exhaustion_level": 9}).status_code == 422
        assert client.get(f"/api/characters/{cid}").json()["exhaustion_level"] == 3

    def test_inventory_and_currency_round_trip(self, client, auth_as, owner):
        """PR 14 (J.2/J.3): currency + inventory persist via the runtime PATCH (no enforcement)."""
        char = _finalize_a_character(client, auth_as, owner)
        cid = char["id"]
        assert char["currency"] == {} and char["inventory"] == []
        r = client.patch(f"/api/characters/{cid}/runtime", json={
            "currency": {"gp": 15, "sp": 4, "cp": -3},  # negative allowed (owes coin)
            "inventory": [
                {"item_code": "rope_hempen", "quantity": 1, "notes": "50 ft coil"},
                {"item_code": "torch", "quantity": 10, "notes": ""},
            ],
        })
        assert r.status_code == 200, r.text
        body = client.get(f"/api/characters/{cid}").json()
        assert body["currency"] == {"gp": 15, "sp": 4, "cp": -3}
        inv = {i["item_code"]: i for i in body["inventory"]}
        assert inv["torch"]["quantity"] == 10
        assert inv["rope_hempen"]["notes"] == "50 ft coil"

    def test_character_summary_snapshot(self, client, auth_as, owner):
        """PR 12 (Phase I): the internal summary returns the api-game snapshot fields. Under the
        /internal path (nginx 404s it externally; reachable only over the private network)."""
        char = _finalize_a_character(client, auth_as, owner)  # Barbarian L1
        body = client.get(f"/api/characters/internal/{char['id']}/summary").json()
        assert body["character_name"] == char["character_name"]
        assert body["character_class"] == ["barbarian"]
        assert body["character_race"] == "human"
        assert body["level"] == 1 and body["hp_max"] == char["hp_max"] and "ac" in body

    def test_conditions_reference_endpoint(self, client, auth_as, owner):
        auth_as(owner.id)
        body = client.get("/api/editions/srd_5_2_1/conditions").json()
        assert "prone" in body and "exhaustion" in body
        assert body["prone"]["name"] == "Prone" and body["prone"]["description"]

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

    def test_preview_surfaces_subclass_and_multiclass_guidance(self, client, auth_as, owner):
        """Phase D: eligibility surfaced, never gated. Barbarian L1 → no subclass yet;
        multiclass options list every other class with its ability-prereq guidance flag."""
        char = _finalize_a_character(client, auth_as, owner)  # Barbarian L1, STR 15 primary
        body = client.get(f"/api/characters/{char['id']}/level-up").json()
        # Subclass unlocks at level 3, so an L1 barbarian is not yet eligible.
        assert body["subclass_eligible"] == []
        mc = body["multiclass_options"]
        assert "barbarian" not in mc  # already taken
        assert "fighter" in mc and "wizard" in mc
        assert mc["fighter"] is True   # STR 15 meets Fighter's prereq
        assert mc["wizard"] is False   # INT 8 fails Wizard's prereq

    def test_derived_exposes_computed_hp_max(self, client, auth_as, owner):
        char = _finalize_a_character(client, auth_as, owner)  # Barbarian L1, CON 15 (+2)
        assert char["derived"]["computed_hp_max"] == 14  # d12 max(12) + 2

    def test_preview_splits_feats_without_hiding_any(self, client, auth_as, owner):
        """Two-bucket feat contract (core/product-principles.md §3.0): every candidate
        feat appears in exactly one of qualifying_feats / other_feats — nothing is hidden."""
        char = _finalize_a_character(client, auth_as, owner)
        body = client.get(f"/api/characters/{char['id']}/level-up").json()

        qualifying = body["qualifying_feats"]
        other = body["other_feats"]
        assert isinstance(qualifying, list) and isinstance(other, list)

        feats_json = json.loads(
            (Path(__file__).resolve().parents[2] / "seed_data" / "srd_5_2_1" / "feats.json")
            .read_text(encoding="utf-8")
        )
        candidates = {
            f["code"]
            for f in feats_json["feats"]
            if f["category"] in {"general", "fighting_style", "epic_boon"}
        }

        # The two buckets together cover the full candidate set — no feat is hidden.
        assert set(qualifying) | set(other) == candidates
        # ...and they don't overlap.
        assert set(qualifying).isdisjoint(other)
        # A level-1 character can't meet the Epic Boon (level 19) prereqs, so the "other"
        # bucket must be populated — proving ineligible feats are surfaced, not dropped.
        assert other, "expected ineligible feats (e.g. Epic Boons) to surface in other_feats"


class TestLevelUpSubclass:
    def test_level_up_to_subclass_level_offers_and_records_subclass(self, client, auth_as, owner):
        """PR 10 (F.1): leveling a Barbarian to 3 surfaces the subclass choice + records it."""
        char = _finalize_a_character(client, auth_as, owner)  # Barbarian L1
        cid = char["id"]
        client.patch(f"/api/characters/{cid}/runtime", json={"xp": 900})  # eligible through level 3
        # Level 1 → 2: no subclass yet (barbarian subclass unlocks at 3).
        r2 = client.post(f"/api/characters/{cid}/level-up",
                         json={"class_code": "barbarian", "hp_choice": "average"})
        assert r2.status_code == 200, r2.text
        # Preview at level 2 now flags the pending subclass + carries feat descriptions (F.2).
        prev = client.get(f"/api/characters/{cid}/level-up").json()
        assert "path_of_the_berserker" in prev["subclass_pending"].get("barbarian", [])
        assert prev["feat_details"]  # non-empty feat description map
        # Level 2 → 3 with the subclass choice.
        r3 = client.post(f"/api/characters/{cid}/level-up", json={
            "class_code": "barbarian", "hp_choice": "average",
            "subclass_choice": {"class_code": "barbarian", "subclass_code": "path_of_the_berserker"},
        })
        assert r3.status_code == 200, r3.text
        body = client.get(f"/api/characters/{cid}").json()
        assert {s["class_code"]: s["subclass_code"] for s in body["subclasses"]} == {
            "barbarian": "path_of_the_berserker",
        }
        # And the subclass no longer shows as pending.
        assert "barbarian" not in client.get(f"/api/characters/{cid}/level-up").json()["subclass_pending"]


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
