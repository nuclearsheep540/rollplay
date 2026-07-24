# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the three-way token board merge (tokens v2, decision 24)
and the derived in-play predicate (decision 25).

The full case table from the design walkthrough:
- mid-battle pause resumes byte-for-byte (play-touched tokens keep state)
- paused-time baseline additions land on resume
- baseline edits to untouched tokens land; to play-touched tokens defer
- play-removed tokens stay dead even if still authored
- pc tokens always come from the board
- fresh session degenerates to pure baseline seeding
"""

from modules.session.domain.token_merge import (
    board_in_play,
    merge_token_boards,
    tokens_equal,
)


def npc(token_id, x=100.0, y=100.0, **overrides):
    token = {
        "id": token_id,
        "kind": "npc",
        "owner_user_id": None,
        "character_id": None,
        "label": token_id,
        "x": x,
        "y": y,
        "footprint": 1,
        "created_by": "dm-user",
        "updated_at": None,
        "hidden": True,
        "locked": False,
    }
    token.update(overrides)
    return token


def pc(token_id, owner, x=50.0, y=50.0):
    return {
        "id": token_id,
        "kind": "pc",
        "owner_user_id": owner,
        "character_id": "char-1",
        "label": None,
        "x": x,
        "y": y,
        "footprint": 1,
        "created_by": owner,
        "updated_at": "2026-07-23T10:00:00+00:00",
        "hidden": False,
        "locked": False,
    }


class TestTokensEqual:
    def test_ignores_server_stamped_fields(self):
        token = npc("goblin")
        restamped = dict(token, updated_at="2026-07-23T12:00:00+00:00", created_by="other")
        assert tokens_equal(token, restamped) is True

    def test_position_difference_is_inequality(self):
        assert tokens_equal(npc("goblin"), npc("goblin", x=999.0)) is False

    def test_both_none_is_equal(self):
        assert tokens_equal(None, None) is True
        assert tokens_equal(npc("goblin"), None) is False


class TestMergeCaseTable:
    def test_fresh_session_seeds_baseline(self):
        merged = merge_token_boards([], [], [npc("goblin"), npc("trap")])
        assert [t["id"] for t in merged] == ["goblin", "trap"]

    def test_untouched_board_adopts_edited_baseline(self):
        seeded = npc("trap", x=500.0)
        edited_baseline = npc("trap", x=600.0)  # workshop moved it while paused
        merged = merge_token_boards([seeded], [dict(seeded)], [edited_baseline])
        assert merged == [edited_baseline]

    def test_play_moved_token_keeps_play_state(self):
        seeded = npc("goblin", x=500.0)
        play_moved = dict(seeded, x=750.0, updated_at="2026-07-23T11:00:00+00:00")
        edited_baseline = npc("goblin", x=100.0)
        merged = merge_token_boards([seeded], [play_moved], [edited_baseline])
        assert merged == [play_moved]

    def test_paused_time_addition_lands(self):
        seeded = npc("goblin")
        new_trap = npc("trap-2", x=2000.0)
        merged = merge_token_boards([seeded], [dict(seeded)], [dict(seeded), new_trap])
        assert [t["id"] for t in merged] == ["goblin", "trap-2"]

    def test_play_removed_token_stays_dead(self):
        killed = npc("goblin")
        survivor = npc("trap")
        merged = merge_token_boards(
            [killed, survivor],
            [dict(survivor)],  # goblin removed in play
            [dict(killed), dict(survivor)],  # baseline still lists it
        )
        assert [t["id"] for t in merged] == ["trap"]

    def test_baseline_removal_of_untouched_token_lands(self):
        retired = npc("goblin")
        merged = merge_token_boards([retired], [dict(retired)], [])
        assert merged == []

    def test_pc_tokens_always_from_board(self):
        player_token = pc("pc-1", "user-1", x=333.0)
        seeded = npc("goblin")
        merged = merge_token_boards([seeded], [player_token, dict(seeded)], [dict(seeded)])
        assert merged[0] == player_token
        assert [t["id"] for t in merged] == ["pc-1", "goblin"]

    def test_runtime_added_npc_survives(self):
        improvised = npc("improv-ogre", x=1234.0)
        merged = merge_token_boards([], [improvised], [])
        assert merged == [improvised]

    def test_trap_under_pc_stacks(self):
        # The C9 scenario: trap authored where a pc stands — both survive.
        player_token = pc("pc-1", "user-1", x=900.0, y=900.0)
        new_trap = npc("trap", x=900.0, y=900.0)
        merged = merge_token_boards([], [player_token], [new_trap])
        assert [t["id"] for t in merged] == ["pc-1", "trap"]


class TestBoardInPlay:
    def test_equal_board_not_in_play(self):
        seeded = npc("goblin")
        board_copy = dict(seeded, updated_at="2026-07-23T12:00:00+00:00")
        assert board_in_play([seeded], [board_copy]) is False

    def test_moved_token_in_play(self):
        seeded = npc("goblin")
        assert board_in_play([seeded], [dict(seeded, x=999.0)]) is True

    def test_added_pc_in_play_and_reverted_is_not(self):
        seeded = npc("goblin")
        with_pc = [dict(seeded), pc("pc-1", "user-1")]
        assert board_in_play([seeded], with_pc) is True
        assert board_in_play([seeded], [dict(seeded)]) is False

    def test_missing_seed_with_board_is_in_play(self):
        assert board_in_play([], [npc("goblin")]) is True
        assert board_in_play(None, [npc("goblin")]) is True

    def test_empty_everything_is_not_in_play(self):
        assert board_in_play([], []) is False
        assert board_in_play(None, None) is False
