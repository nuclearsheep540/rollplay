# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for tokens v2 DM controls: the hidden/locked contract flags
(decisions 17-19), the configure whitelist extension, and the server-side
hidden filtering helpers (per-recipient visibility, decision 17).

Run from api-game/: python -m pytest tests/
"""

import pytest
from pydantic import ValidationError

from map_token_ops import (
    CONFIGURABLE_TOKEN_FIELDS,
    build_map_token_update,
    filter_hidden_tokens,
    filter_map_token_state_for_player,
)
from shared_contracts.map_token import MapToken

ASSET_ID = "asset-abc"
ARRAY_PATH = f"map_token_state.{ASSET_ID}"


def make_npc_token(**overrides):
    token = {
        "id": "npc-1",
        "kind": "npc",
        "owner_user_id": None,
        "character_id": None,
        "label": "Goblin",
        "x": 100.0,
        "y": 200.0,
        "footprint": 1,
        "created_by": "dm-user",
        "updated_at": None,
        "hidden": False,
        "locked": False,
    }
    token.update(overrides)
    return token


class TestContractFlags:
    def test_flags_default_false(self):
        token = MapToken.model_validate({
            "id": "t1", "kind": "pc", "owner_user_id": "u1", "x": 1.0, "y": 2.0,
            "created_by": "u1",
        })
        assert token.hidden is False
        assert token.locked is False

    def test_npc_may_hide_and_lock(self):
        token = MapToken.model_validate(make_npc_token(hidden=True, locked=True))
        assert token.hidden is True
        assert token.locked is True

    def test_pc_hidden_rejected(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate({
                "id": "t1", "kind": "pc", "owner_user_id": "u1", "x": 1.0, "y": 2.0,
                "created_by": "u1", "hidden": True,
            })

    def test_npc_assignment_validates(self):
        # An assigned npc token is a player's minion/companion — the
        # assignment itself is the player-side signal.
        token = MapToken.model_validate(make_npc_token(owner_user_id="player-1"))
        assert token.owner_user_id == "player-1"

    def test_pc_locked_rejected(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate({
                "id": "t1", "kind": "pc", "owner_user_id": "u1", "x": 1.0, "y": 2.0,
                "created_by": "u1", "locked": True,
            })

    def test_stored_v1_tokens_still_validate(self):
        # Boards persisted before v2 have no hidden/locked keys — defaults
        # must absorb them (ETL revalidates per token at session start).
        v1_token = make_npc_token()
        del v1_token["hidden"]
        del v1_token["locked"]
        assert MapToken.model_validate(v1_token).hidden is False


class TestConfigureWhitelist:
    def test_hidden_and_locked_are_configurable(self):
        assert "hidden" in CONFIGURABLE_TOKEN_FIELDS
        assert "locked" in CONFIGURABLE_TOKEN_FIELDS

    def test_configure_sets_false_values(self):
        # The reveal op is configure hidden=False — a falsy value must still
        # be written (the builder skips only absent/None fields).
        _extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "configure",
            token=make_npc_token(hidden=False, locked=False),
            token_id="npc-1", updated_at="stamp"
        )
        assert update_doc["$set"][f"{ARRAY_PATH}.$.hidden"] is False
        assert update_doc["$set"][f"{ARRAY_PATH}.$.locked"] is False

    def test_configure_sets_true_values(self):
        _extra_filter, update_doc = build_map_token_update(
            ASSET_ID, "configure",
            token=make_npc_token(hidden=True, locked=True),
            token_id="npc-1", updated_at="stamp"
        )
        assert update_doc["$set"][f"{ARRAY_PATH}.$.hidden"] is True
        assert update_doc["$set"][f"{ARRAY_PATH}.$.locked"] is True


class TestHiddenFiltering:
    def test_hidden_tokens_stripped_for_players(self):
        board = [
            make_npc_token(id="visible-npc"),
            make_npc_token(id="ambush", hidden=True),
            {"id": "pc-1", "kind": "pc", "x": 1.0, "y": 2.0},
        ]
        visible = filter_hidden_tokens(board)
        visible_ids = [board_token["id"] for board_token in visible]
        assert visible_ids == ["visible-npc", "pc-1"]

    def test_v1_tokens_without_flag_pass_through(self):
        board = [{"id": "old-token", "kind": "pc", "x": 1.0, "y": 2.0}]
        assert filter_hidden_tokens(board) == board

    def test_state_filter_covers_every_board(self):
        state = {
            "map-a": [make_npc_token(id="a1", hidden=True), make_npc_token(id="a2")],
            "map-b": [make_npc_token(id="b1")],
            "map-c": [],
        }
        filtered = filter_map_token_state_for_player(state)
        assert [t["id"] for t in filtered["map-a"]] == ["a2"]
        assert [t["id"] for t in filtered["map-b"]] == ["b1"]
        assert filtered["map-c"] == []

    def test_state_filter_tolerates_none(self):
        assert filter_map_token_state_for_player(None) == {}
        assert filter_map_token_state_for_player({"map-a": None}) == {"map-a": []}
