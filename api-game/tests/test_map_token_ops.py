# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the pure MapToken op builders.

Run from api-game/: python -m pytest tests/
No database or framework imports — these exercise the update-spec logic that
GameService.apply_map_token_op executes atomically.
"""

import pytest

from map_token_ops import (
    VALID_MAP_TOKEN_OPS,
    build_map_token_update,
    grid_cell_label,
    is_valid_asset_key,
    map_token_array_path,
)

ASSET_ID = "asset-abc"
ARRAY_PATH = f"map_token_state.{ASSET_ID}"


def make_token(**overrides):
    token = {
        "id": "token-1",
        "kind": "pc",
        "owner_user_id": "user-1",
        "character_id": "char-1",
        "label": None,
        "x": 100.0,
        "y": 200.0,
        "footprint": 1,
        "created_by": "user-1",
        "updated_at": None,
    }
    token.update(overrides)
    return token


class TestBuildPlace:
    def test_pushes_token_with_server_timestamp(self):
        extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "place", token=make_token(), updated_at="2026-07-20T12:00:00+00:00"
        )
        pushed = update_doc["$push"][ARRAY_PATH]
        assert pushed["id"] == "token-1"
        assert pushed["updated_at"] == "2026-07-20T12:00:00+00:00"

    def test_filter_guards_duplicate_id_atomically(self):
        extra_filter, _update_doc = build_map_token_update(ASSET_ID, "place", token=make_token())
        assert extra_filter == {f"{ARRAY_PATH}.id": {"$ne": "token-1"}}


class TestBuildMove:
    def test_positional_set_of_position_only(self):
        extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "move", token=make_token(x=42.0, y=17.5), token_id="token-1",
            updated_at="stamp"
        )
        assert extra_filter == {f"{ARRAY_PATH}.id": "token-1"}
        assert update_doc == {
            "$set": {
                f"{ARRAY_PATH}.$.x": 42.0,
                f"{ARRAY_PATH}.$.y": 17.5,
                f"{ARRAY_PATH}.$.updated_at": "stamp",
            }
        }

    def test_two_tokens_build_independent_updates(self):
        # Different tokens target different array elements — per-op surgery,
        # never whole-array replace, so concurrent commits can't clobber.
        filter_one, _ = build_map_token_update(
            ASSET_ID, "move", token=make_token(id="token-1"), token_id="token-1"
        )
        filter_two, _ = build_map_token_update(
            ASSET_ID, "move", token=make_token(id="token-2"), token_id="token-2"
        )
        assert filter_one != filter_two


class TestBuildRemove:
    def test_pulls_by_id_with_no_extra_filter(self):
        extra_filter, update_doc = build_map_token_update(ASSET_ID, "remove", token_id="token-1")
        assert extra_filter == {}
        assert update_doc == {"$pull": {ARRAY_PATH: {"id": "token-1"}}}


class TestBuildConfigure:
    def test_sets_only_provided_configurable_fields(self):
        extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "configure",
            token=make_token(label="Ogre", footprint=2),
            token_id="token-1", updated_at="stamp"
        )
        assert extra_filter == {f"{ARRAY_PATH}.id": "token-1"}
        assert update_doc["$set"] == {
            f"{ARRAY_PATH}.$.updated_at": "stamp",
            f"{ARRAY_PATH}.$.label": "Ogre",
            f"{ARRAY_PATH}.$.footprint": 2,
        }

    def test_absent_label_is_not_cleared(self):
        _extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "configure", token=make_token(label=None, footprint=3), token_id="token-1"
        )
        assert f"{ARRAY_PATH}.$.label" not in update_doc["$set"]

    def test_identity_fields_never_configurable(self):
        _extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "configure",
            token=make_token(kind="npc", owner_user_id="someone-else", label="Ogre"),
            token_id="token-1"
        )
        set_paths = update_doc["$set"].keys()
        assert not any(path.endswith(".kind") for path in set_paths)
        assert not any(path.endswith(".owner_user_id") for path in set_paths)


class TestOpValidation:
    def test_unknown_op_raises(self):
        with pytest.raises(ValueError):
            build_map_token_update(ASSET_ID, "teleport", token=make_token())

    def test_all_valid_ops_build(self):
        for op in VALID_MAP_TOKEN_OPS:
            build_map_token_update(ASSET_ID, op, token=make_token(), token_id="token-1")

    def test_array_path_keys_per_asset(self):
        assert map_token_array_path("abc") == "map_token_state.abc"


class TestGridCellLabel:
    def grid(self, **overrides):
        config = {
            "enabled": True,
            "grid_width": 20,
            "grid_height": 20,
            "offset_x": 0,
            "offset_y": 0,
            "grid_cell_size": 100.0,
        }
        config.update(overrides)
        return config

    def test_origin_cell_is_a1(self):
        assert grid_cell_label(50.0, 50.0, self.grid()) == "A1"

    def test_col_and_row_address(self):
        # col 3 (D), row 6 (7) at 100px cells
        assert grid_cell_label(350.0, 650.0, self.grid()) == "D7"

    def test_offsets_shift_the_origin(self):
        assert grid_cell_label(75.0, 75.0, self.grid(offset_x=50, offset_y=50)) == "A1"

    def test_excel_style_rollover_past_z(self):
        assert grid_cell_label(2650.0, 50.0, self.grid(grid_width=30)) == "AA1"

    def test_out_of_bounds_returns_none(self):
        assert grid_cell_label(-10.0, 50.0, self.grid()) is None
        assert grid_cell_label(2500.0, 50.0, self.grid()) is None

    def test_disabled_or_absent_grid_returns_none(self):
        assert grid_cell_label(50.0, 50.0, self.grid(enabled=False)) is None
        assert grid_cell_label(50.0, 50.0, None) is None

    def test_untuned_cell_size_returns_none(self):
        # The client-side fallback sizing needs image dimensions the server
        # doesn't have — no label rather than a wrong one.
        assert grid_cell_label(50.0, 50.0, self.grid(grid_cell_size=None)) is None


class TestAssetKeyGuard:
    def test_uuid_asset_ids_pass(self):
        assert is_valid_asset_key("3f1c9a2e-0000-4000-8000-000000000001") is True

    def test_mongo_hostile_keys_rejected(self):
        assert is_valid_asset_key("a.b") is False        # dot = nested-path split
        assert is_valid_asset_key("$where") is False     # leading $ = operator
        assert is_valid_asset_key("a\x00b") is False     # NUL byte
        assert is_valid_asset_key("") is False
        assert is_valid_asset_key(None) is False
        assert is_valid_asset_key(123) is False
