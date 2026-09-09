# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Recipient and persistence contract for the presence events.

Two rules are load-bearing here and easy to break by copying a neighbouring
factory: presence goes ONLY to the user's accepted friends (it is never public),
and presence is NEVER persisted — it is a now-state, so a notification row for
every login would be pure noise that outlives the fact it describes.

DB-free: the event factories are pure.
"""

from uuid import uuid4

import pytest

from modules.friendship.domain.friendship_events import FriendshipEvents


@pytest.fixture
def friends():
    """Three accepted friends of the user whose presence changed."""
    return [uuid4(), uuid4(), uuid4()]


class TestFriendOnline:
    def test_reaches_every_friend_and_nobody_else(self, friends):
        events = FriendshipEvents.friend_online(friends, uuid4(), "Matt")

        assert sorted(str(event.user_id) for event in events) == sorted(
            str(friend_id) for friend_id in friends
        )

    def test_toasts_because_a_friend_arriving_is_worth_knowing(self, friends):
        events = FriendshipEvents.friend_online(friends, uuid4(), "Matt")

        assert all(event.show_toast for event in events)

    def test_is_never_persisted(self, friends):
        events = FriendshipEvents.friend_online(friends, uuid4(), "Matt")

        assert not any(event.save_notification for event in events)

    def test_carries_the_subject_user_for_the_pulse_line(self, friends):
        user_id = uuid4()

        events = FriendshipEvents.friend_online(friends, user_id, "Matt")

        assert events[0].data == {"user_id": str(user_id), "screen_name": "Matt"}

    def test_no_friends_means_no_events(self):
        assert FriendshipEvents.friend_online([], uuid4(), "Matt") == []


class TestFriendOffline:
    def test_reaches_every_friend_and_nobody_else(self, friends):
        events = FriendshipEvents.friend_offline(friends, uuid4(), "Matt")

        assert sorted(str(event.user_id) for event in events) == sorted(
            str(friend_id) for friend_id in friends
        )

    def test_is_silent_because_leaving_should_not_interrupt(self, friends):
        events = FriendshipEvents.friend_offline(friends, uuid4(), "Matt")

        assert not any(event.show_toast for event in events)

    def test_is_never_persisted(self, friends):
        events = FriendshipEvents.friend_offline(friends, uuid4(), "Matt")

        assert not any(event.save_notification for event in events)
