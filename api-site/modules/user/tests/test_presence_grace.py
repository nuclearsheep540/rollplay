# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The grace window that separates a refresh from a genuine return.

A remount closes and reopens the socket in well under a second. Without this
rule every friend is told the user left and came back — twice the noise for
something that never happened. The window makes "came online" mean what a
reader assumes it means.

Note what is NOT suppressed: the event still fires. Clients repaint presence by
refetching when it arrives, so withholding it would strand a friend's dot on a
stale value. Only the announcement is silenced.

DB-free: the rule is a pure aggregate method.
"""

from datetime import timedelta
from uuid import uuid4

from modules.friendship.domain.friendship_events import FriendshipEvents
from modules.user.domain.user_aggregate import (
    PRESENCE_GRACE_SECONDS,
    UserAggregate,
    utc_now,
)


def make_user(last_seen=None):
    """A fresh user per call — never a shared instance across tests."""
    return UserAggregate(
        id=None,
        email="player@example.com",
        screen_name="Player",
        created_at=utc_now(),
        last_seen=last_seen,
    )


class TestReturnedAfterAbsence:
    def test_a_user_who_has_never_disconnected_is_arriving(self):
        assert make_user(last_seen=None).returned_after_absence() is True

    def test_a_refresh_is_not_an_arrival(self):
        just_left = utc_now() - timedelta(seconds=1)

        assert make_user(last_seen=just_left).returned_after_absence() is False

    def test_still_not_an_arrival_just_inside_the_window(self):
        nearly_expired = utc_now() - timedelta(seconds=PRESENCE_GRACE_SECONDS - 2)

        assert make_user(last_seen=nearly_expired).returned_after_absence() is False

    def test_an_absence_past_the_window_is_an_arrival(self):
        long_gone = utc_now() - timedelta(seconds=PRESENCE_GRACE_SECONDS + 2)

        assert make_user(last_seen=long_gone).returned_after_absence() is True

    def test_the_window_is_configurable_for_callers_that_need_it(self):
        five_seconds_ago = utc_now() - timedelta(seconds=5)
        user = make_user(last_seen=five_seconds_ago)

        assert user.returned_after_absence(grace_seconds=2) is True
        assert user.returned_after_absence(grace_seconds=60) is False


class TestNaiveTimestampsFromTheDatabase:
    """last_seen read back from PostgreSQL has no timezone.

    Every datetime column on `users` is naive by the table's convention, so the
    offset utc_now() attached is dropped on write and missing on read. The
    in-memory tests above never see this, because they hand the aggregate the
    aware value directly — this is the shape the running app actually gets, and
    subtracting it from an aware now() raised TypeError until the method
    normalised it.
    """

    def test_a_naive_recent_timestamp_is_still_a_reconnection(self):
        naive_recent = (utc_now() - timedelta(seconds=1)).replace(tzinfo=None)

        assert make_user(last_seen=naive_recent).returned_after_absence() is False

    def test_a_naive_old_timestamp_is_still_an_arrival(self):
        naive_old = (utc_now() - timedelta(seconds=PRESENCE_GRACE_SECONDS + 60)).replace(tzinfo=None)

        assert make_user(last_seen=naive_old).returned_after_absence() is True


class TestRecordDisconnect:
    def test_stamps_the_moment_they_left(self):
        user = make_user()

        user.record_disconnect()

        assert (utc_now() - user.last_seen).total_seconds() < 1

    def test_a_stamped_user_is_immediately_inside_the_window(self):
        """The whole point: stamping on the way out is what makes the very next
        connection read as a reconnection rather than an arrival."""
        user = make_user()

        user.record_disconnect()

        assert user.returned_after_absence() is False


class TestSilentArrival:
    """What `announce=False` actually changes on the wire."""

    def test_a_silent_arrival_still_reaches_every_friend(self):
        friends = [uuid4(), uuid4(), uuid4()]

        events = FriendshipEvents.friend_online(
            friends, uuid4(), "Matt", announce=False
        )

        assert len(events) == len(friends)

    def test_a_silent_arrival_announces_nowhere(self):
        friend_id = uuid4()

        events = FriendshipEvents.friend_online(
            [friend_id], uuid4(), "Matt", announce=False
        )

        assert events[0].show_toast is False
        assert events[0].show_pulse is False

    def test_a_real_arrival_toasts_and_pulses(self):
        friend_id = uuid4()

        events = FriendshipEvents.friend_online([friend_id], uuid4(), "Matt")

        assert events[0].show_toast is True
        assert events[0].show_pulse is True

    def test_neither_kind_is_ever_persisted(self):
        friend_id = uuid4()
        user_id = uuid4()

        loud = FriendshipEvents.friend_online([friend_id], user_id, "Matt")
        quiet = FriendshipEvents.friend_online([friend_id], user_id, "Matt", announce=False)

        assert loud[0].save_notification is False
        assert quiet[0].save_notification is False
