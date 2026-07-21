# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the in-memory map-token hold registry (product decision 11:
first hand on the mini wins — concurrency, not ownership). Holds are keyed
(asset_id, token_id) within a room: NPC stamps reuse one token id across
maps, so per-board scoping is what stops cross-map interference."""

from map_token_holds import MapTokenHolds

ROOM = "room-1"
BOARD = "asset-1"


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def make_holds(staleness_seconds=10.0):
    clock = FakeClock()
    return MapTokenHolds(staleness_seconds=staleness_seconds, clock=clock), clock


class TestGrab:
    def test_first_grab_wins(self):
        holds, _clock = make_holds()
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_competing_grab_denied_with_holder(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.try_grab(ROOM, BOARD, "token-1", "bob") == "alice"
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_same_user_regrab_succeeds_and_refreshes(self):
        holds, clock = make_holds(staleness_seconds=10.0)
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        clock.advance(7.0)
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        clock.advance(7.0)  # 14s since first grab, 7s since refresh
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_different_tokens_hold_independently(self):
        holds, _clock = make_holds()
        assert holds.try_grab(ROOM, BOARD, "token-1", "alice") is None
        assert holds.try_grab(ROOM, BOARD, "token-2", "bob") is None

    def test_same_token_id_on_different_boards_holds_independently(self):
        # NPC per-map stamps: one draft id, one token per board. A hold on
        # map A must not block (or be released by) the same id on map B.
        holds, _clock = make_holds()
        assert holds.try_grab(ROOM, "asset-a", "goblin", "alice") is None
        assert holds.try_grab(ROOM, "asset-b", "goblin", "bob") is None
        assert holds.holder(ROOM, "asset-a", "goblin") == "alice"
        assert holds.holder(ROOM, "asset-b", "goblin") == "bob"

    def test_rooms_are_isolated(self):
        holds, _clock = make_holds()
        holds.try_grab("room-1", BOARD, "token-1", "alice")
        assert holds.try_grab("room-2", BOARD, "token-1", "bob") is None


class TestRelease:
    def test_holder_release_clears(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.release(ROOM, BOARD, "token-1", "alice") is True
        assert holds.holder(ROOM, BOARD, "token-1") is None

    def test_non_holder_release_is_refused(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        assert holds.release(ROOM, BOARD, "token-1", "bob") is False
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"

    def test_release_of_unheld_token_is_refused(self):
        holds, _clock = make_holds()
        assert holds.release(ROOM, BOARD, "token-1", "alice") is False

    def test_release_on_wrong_board_is_refused(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "asset-a", "goblin", "alice")
        assert holds.release(ROOM, "asset-b", "goblin", "alice") is False
        assert holds.holder(ROOM, "asset-a", "goblin") == "alice"


class TestStaleness:
    def test_stale_hold_expires_lazily(self):
        holds, clock = make_holds(staleness_seconds=10.0)
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        clock.advance(11.0)
        assert holds.holder(ROOM, BOARD, "token-1") is None

    def test_stale_hold_is_grabbable(self):
        holds, clock = make_holds(staleness_seconds=10.0)
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        clock.advance(11.0)
        assert holds.try_grab(ROOM, BOARD, "token-1", "bob") is None
        assert holds.holder(ROOM, BOARD, "token-1") == "bob"

    def test_fresh_hold_does_not_expire(self):
        holds, clock = make_holds(staleness_seconds=10.0)
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        clock.advance(9.0)
        assert holds.holder(ROOM, BOARD, "token-1") == "alice"


class TestDisconnectCleanup:
    def test_releases_all_holds_for_user_across_boards(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "asset-a", "token-1", "alice")
        holds.try_grab(ROOM, "asset-b", "token-2", "alice")
        holds.try_grab(ROOM, "asset-a", "token-3", "bob")

        released = holds.release_all_for_user(ROOM, "alice")

        assert sorted(released) == [("asset-a", "token-1"), ("asset-b", "token-2")]
        assert holds.holder(ROOM, "asset-a", "token-1") is None
        assert holds.holder(ROOM, "asset-b", "token-2") is None
        assert holds.holder(ROOM, "asset-a", "token-3") == "bob"

    def test_clear_room_drops_everything(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, BOARD, "token-1", "alice")
        holds.clear_room(ROOM)
        assert holds.holder(ROOM, BOARD, "token-1") is None
