# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the in-memory map-token hold registry (product decision 11:
first hand on the mini wins — concurrency, not ownership)."""

from map_token_holds import MapTokenHolds

ROOM = "room-1"


class FakeClock:
    def __init__(self):
        self.now = 1000.0

    def __call__(self):
        return self.now

    def advance(self, seconds):
        self.now += seconds


def make_holds(staleness_seconds=30.0):
    clock = FakeClock()
    return MapTokenHolds(staleness_seconds=staleness_seconds, clock=clock), clock


class TestGrab:
    def test_first_grab_wins(self):
        holds, _clock = make_holds()
        assert holds.try_grab(ROOM, "token-1", "alice") is None
        assert holds.holder(ROOM, "token-1") == "alice"

    def test_competing_grab_denied_with_holder(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "token-1", "alice")
        assert holds.try_grab(ROOM, "token-1", "bob") == "alice"
        assert holds.holder(ROOM, "token-1") == "alice"

    def test_same_user_regrab_succeeds_and_refreshes(self):
        holds, clock = make_holds(staleness_seconds=30.0)
        holds.try_grab(ROOM, "token-1", "alice")
        clock.advance(20.0)
        assert holds.try_grab(ROOM, "token-1", "alice") is None
        clock.advance(20.0)  # 40s since first grab, 20s since refresh
        assert holds.holder(ROOM, "token-1") == "alice"

    def test_different_tokens_hold_independently(self):
        holds, _clock = make_holds()
        assert holds.try_grab(ROOM, "token-1", "alice") is None
        assert holds.try_grab(ROOM, "token-2", "bob") is None

    def test_rooms_are_isolated(self):
        holds, _clock = make_holds()
        holds.try_grab("room-1", "token-1", "alice")
        assert holds.try_grab("room-2", "token-1", "bob") is None


class TestRelease:
    def test_holder_release_clears(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "token-1", "alice")
        assert holds.release(ROOM, "token-1", "alice") is True
        assert holds.holder(ROOM, "token-1") is None

    def test_non_holder_release_is_refused(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "token-1", "alice")
        assert holds.release(ROOM, "token-1", "bob") is False
        assert holds.holder(ROOM, "token-1") == "alice"

    def test_release_of_unheld_token_is_refused(self):
        holds, _clock = make_holds()
        assert holds.release(ROOM, "token-1", "alice") is False


class TestStaleness:
    def test_stale_hold_expires_lazily(self):
        holds, clock = make_holds(staleness_seconds=30.0)
        holds.try_grab(ROOM, "token-1", "alice")
        clock.advance(31.0)
        assert holds.holder(ROOM, "token-1") is None

    def test_stale_hold_is_grabbable(self):
        holds, clock = make_holds(staleness_seconds=30.0)
        holds.try_grab(ROOM, "token-1", "alice")
        clock.advance(31.0)
        assert holds.try_grab(ROOM, "token-1", "bob") is None
        assert holds.holder(ROOM, "token-1") == "bob"

    def test_fresh_hold_does_not_expire(self):
        holds, clock = make_holds(staleness_seconds=30.0)
        holds.try_grab(ROOM, "token-1", "alice")
        clock.advance(29.0)
        assert holds.holder(ROOM, "token-1") == "alice"


class TestDisconnectCleanup:
    def test_releases_all_holds_for_user(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "token-1", "alice")
        holds.try_grab(ROOM, "token-2", "alice")
        holds.try_grab(ROOM, "token-3", "bob")

        released = holds.release_all_for_user(ROOM, "alice")

        assert sorted(released) == ["token-1", "token-2"]
        assert holds.holder(ROOM, "token-1") is None
        assert holds.holder(ROOM, "token-3") == "bob"

    def test_clear_room_drops_everything(self):
        holds, _clock = make_holds()
        holds.try_grab(ROOM, "token-1", "alice")
        holds.clear_room(ROOM)
        assert holds.holder(ROOM, "token-1") is None
