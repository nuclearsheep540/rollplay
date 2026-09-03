# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the in-memory map-token hold registry (product decision 11:
first hand on the mini wins — concurrency, not ownership). Holds are keyed
(asset_id, token_id) within a room: NPC stamps reuse one token id across
maps, so per-board scoping is what stops cross-map interference.

There is no staleness suite here by design. Decision 54 removed idle expiry
outright: a hold ends on an explicit release or on release_all_for_user at
its holder's disconnect, and on nothing else. Time is no longer an input to
this module, so there is no clock to fake.
"""

from map_token_holds import MapTokenHolds

ROOM = "room-1"
BOARD = "asset-1"


def make_holds():
    return MapTokenHolds()


class TestGrab:
    def test_first_grab_wins(self):
        holds = make_holds()
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_competing_grab_denied_with_holder(self):
        holds = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.try_grab(ROOM, BOARD, "token-1", "bob") == "alice"
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_same_user_regrab_succeeds(self):
        # Idempotent: a client that reconnects mid-drag reclaims its own hold
        # rather than being denied by itself.
        holds = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_different_tokens_hold_independently(self):
        holds = make_holds()
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        assert holds.try_grab(ROOM, BOARD, "token-2", "bob") is None

    def test_same_token_id_on_different_boards_holds_independently(self):
        # NPC per-map stamps: one draft id, one token per board. A hold on
        # map A must not block (or be released by) the same id on map B.
        holds = make_holds()
        assert holds.try_grab(ROOM, "asset-a", "goblin", "alice") is None
        assert holds.try_grab(ROOM, "asset-b", "goblin", "bob") is None
        assert holds.holder(ROOM, "asset-a", "goblin") == "alice"
        assert holds.holder(ROOM, "asset-b", "goblin") == "bob"

    def test_rooms_are_isolated(self):
        holds = make_holds()
        holds.try_grab("room-1", BOARD, "token-1", "alice")
        assert holds.try_grab("room-2", BOARD, "token-1", "bob") is None


class TestRelease:
    def test_holder_release_clears(self):
        holds = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.release(ROOM, BOARD, "token-1", "alice") is True
        assert holds.holder(ROOM, BOARD, "token-1") is None

    def test_non_holder_release_is_refused(self):
        holds = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.release(ROOM, BOARD, "token-1", "bob") is False
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_release_of_unheld_token_is_refused(self):
        holds = make_holds()
        assert holds.release(ROOM, BOARD, "token-1", "alice") is False

    def test_release_on_wrong_board_is_refused(self):
        holds = make_holds()
        holds.try_grab(ROOM, "asset-a", "goblin", "alice")
        assert holds.release(ROOM, "asset-b", "goblin", "alice") is False
        assert holds.holder(ROOM, "asset-a", "goblin") == "alice"



class TestDisconnectCleanup:
    def test_releases_all_holds_for_user_across_boards(self):
        holds = make_holds()
        holds.try_grab(ROOM, "asset-a", "token-1", "alice")
        holds.try_grab(ROOM, "asset-b", "token-2", "alice")
        holds.try_grab(ROOM, "asset-a", "token-3", "bob")

        released = holds.release_all_for_user(ROOM, "alice")

        assert sorted(released) == [("asset-a", "token-1"), ("asset-b", "token-2")]
        assert holds.holder(ROOM, "asset-a", "token-1") is None
        assert holds.holder(ROOM, "asset-b", "token-2") is None
        assert holds.holder(ROOM, "asset-a", "token-3") == "bob"

    def test_clear_room_drops_everything(self):
        holds = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        holds.clear_room(ROOM)
        assert holds.holder(ROOM, BOARD, "token-1") is None
