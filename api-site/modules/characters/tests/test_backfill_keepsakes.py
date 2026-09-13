# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The pure half of the keepsake backfill.

Existing characters are kept, not discarded: each one loses its table and keeps a snapshot
built from what the old row actually had — its name, its hit points and its ability scores.
That is precisely the state a character reaches when its campaign is deleted, so migrated
rows need no code path of their own.

These tests exercise ``build_keepsake`` alone. It touches no database, so it can be proved
here; the script's I/O half is proved by running it on dev.
"""

import pytest
from shared_contracts.character_config import CharacterConfig, CharacterSheet
from pydantic import TypeAdapter
from shared_contracts.components import ComponentValue

from scripts.backfill_keepsakes import build_keepsake

VALUES = TypeAdapter(dict)


def revalidate(keepsake):
    """What the repository will do when it reads the row back."""
    config = CharacterConfig.model_validate(keepsake["config_snapshot"])
    adapter = TypeAdapter(ComponentValue)
    values = {key: adapter.validate_python(value) for key, value in keepsake["values"].items()}
    return CharacterSheet(config=config, values=values)


class TestBuildKeepsake:
    def test_components_are_name_then_hit_points_then_attributes(self):
        keepsake = build_keepsake(
            {"character_name": "Daiki Bando", "hp_max": 10, "hp_current": 7},
            [("strength", 11), ("dexterity", 15)],
        )
        config = CharacterConfig.model_validate(keepsake["config_snapshot"])
        assert [(component.type, component.label) for component in config.components] == [
            ("identity", "Name"),
            ("hit_points", "Hit points"),
            ("attribute", "Strength"),
            ("attribute", "Dexterity"),
        ]

    def test_values_carry_the_old_row(self):
        keepsake = build_keepsake(
            {"character_name": "Daiki Bando", "hp_max": 10, "hp_current": 7},
            [("strength", 11), ("dexterity", 15)],
        )
        values = keepsake["values"]
        assert values["identity_1"]["answer"] == {"kind": "text", "text": "Daiki Bando"}
        assert values["hit_points_1"]["state"]["current"] == 7
        assert values["attribute_1"]["score"] == 11
        assert values["attribute_2"]["score"] == 15

    def test_display_name_comes_from_the_old_name(self):
        keepsake = build_keepsake({"character_name": "Daiki Bando", "hp_max": 10, "hp_current": 10}, [])
        assert keepsake["display_name"] == "Daiki Bando"

    def test_blank_name_falls_back(self):
        keepsake = build_keepsake({"character_name": "   ", "hp_max": 1, "hp_current": 1}, [])
        assert keepsake["display_name"] == "Unnamed character"
        assert keepsake["values"]["identity_1"]["answer"]["text"] == ""

    def test_hp_current_above_max_is_clamped(self):
        """Old rows are not trusted to be consistent; the snapshot must still validate."""
        keepsake = build_keepsake({"character_name": "Over", "hp_max": 10, "hp_current": 40}, [])
        assert keepsake["values"]["hit_points_1"]["state"]["current"] == 10

    def test_zero_hp_max_still_produces_a_legal_scale(self):
        """maximum must be >= 1 in the contract, so a 0-max row becomes a 1-max component."""
        keepsake = build_keepsake({"character_name": "Zero", "hp_max": 0, "hp_current": 0}, [])
        config = CharacterConfig.model_validate(keepsake["config_snapshot"])
        assert config.components[1].rules.maximum == 1

    def test_ability_scores_are_clamped_into_the_declared_range(self):
        keepsake = build_keepsake(
            {"character_name": "Odd", "hp_max": 1, "hp_current": 1},
            [("strength", 0), ("charisma", 99)],
        )
        assert keepsake["values"]["attribute_1"]["score"] == 1
        assert keepsake["values"]["attribute_2"]["score"] == 30

    def test_result_pairs_as_a_character_sheet(self):
        """The invariant the script asserts before writing a single row."""
        keepsake = build_keepsake(
            {"character_name": "Daiki Bando", "hp_max": 10, "hp_current": 7},
            [("strength", 11), ("dexterity", 15), ("constitution", 10)],
        )
        sheet = revalidate(keepsake)
        assert sheet.values["identity_1"].answer.text == "Daiki Bando"
        assert len(sheet.config.components) == 5

    def test_no_abilities_is_still_a_valid_keepsake(self):
        sheet = revalidate(build_keepsake({"character_name": "Lonely", "hp_max": 5, "hp_current": 5}, []))
        assert len(sheet.config.components) == 2

    def test_pure_function_does_not_share_state_between_calls(self):
        first = build_keepsake({"character_name": "A", "hp_max": 1, "hp_current": 1}, [])
        second = build_keepsake({"character_name": "B", "hp_max": 1, "hp_current": 1}, [])
        assert first["config_snapshot"] is not second["config_snapshot"]
        assert first["values"] is not second["values"]
