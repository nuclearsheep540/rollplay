# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The pulse bucket: bounded, self-expiring, owned by the user.

The pulse is a sensor reading rather than a log — the few most recent things
that happened near this user, forgotten soon after. Both bounds carry weight:
the cap keeps the line glanceable, and the lifetime keeps it honest, because a
pill reading "came online" is a claim about NOW.

The self-maintaining part is what removes any need for a scheduled cleanup:
buckets are tidied by being used, and expiry is applied on read as well, so an
entry that lapsed while nothing happened is invisible immediately.

Every test builds its own user via make_user() — the aggregate's pulse list
uses default_factory precisely so two users can never share one, and a test
that reached for a module-level user would be writing to a global.

DB-free: the rules are pure aggregate methods.
"""

from datetime import datetime, timedelta

from modules.user.domain.user_aggregate import (
    MAX_PULSE_EVENTS,
    PULSE_EVENT_LIFETIME_SECONDS,
    UserAggregate,
    utc_now,
)


def make_user():
    """A fresh user, with a fresh empty bucket, per call."""
    return UserAggregate(
        id=None,
        email="player@example.com",
        screen_name="Player",
        created_at=utc_now(),
    )


def friend_online(name):
    """The payload shape presence actually broadcasts."""
    return {"user_id": f"id-{name}", "screen_name": name}


class TestBucketIsolation:
    def test_two_users_never_share_a_bucket(self):
        """A shared default would make one user's first event appear for
        everyone in the process — the classic mutable-default leak."""
        first = make_user()
        second = make_user()

        assert first.pulse_events is not second.pulse_events

    def test_recording_for_one_user_leaves_the_other_empty(self):
        first = make_user()
        second = make_user()

        first.record_pulse_event("friend_online", friend_online("Ana"))

        assert second.pulse_events == []


class TestOrderingAndCap:
    def test_the_newest_event_is_first(self):
        user = make_user()

        user.record_pulse_event("friend_online", friend_online("Ana"))
        user.record_pulse_event("friend_online", friend_online("Ben"))

        assert user.pulse_events[0]["data"]["screen_name"] == "Ben"

    def test_the_bucket_never_exceeds_the_cap(self):
        user = make_user()

        for index in range(MAX_PULSE_EVENTS + 4):
            user.record_pulse_event("friend_online", friend_online(f"Friend{index}"))

        assert len(user.pulse_events) == MAX_PULSE_EVENTS

    def test_the_oldest_falls_off_when_the_cap_is_reached(self):
        user = make_user()

        user.record_pulse_event("friend_online", friend_online("Oldest"))
        for index in range(MAX_PULSE_EVENTS):
            user.record_pulse_event("friend_online", friend_online(f"Later{index}"))

        names = [entry["data"]["screen_name"] for entry in user.pulse_events]
        assert "Oldest" not in names


class TestRepeats:
    def test_the_same_event_twice_occupies_one_slot(self):
        """One noisy friend logging in repeatedly must not evict everything
        else from a five-slot bucket."""
        user = make_user()

        user.record_pulse_event("friend_online", friend_online("Ana"))
        user.record_pulse_event("friend_online", friend_online("Ana"))

        assert len(user.pulse_events) == 1

    def test_a_repeat_moves_back_to_the_front(self):
        user = make_user()
        user.record_pulse_event("friend_online", friend_online("Ana"))
        user.record_pulse_event("friend_online", friend_online("Ben"))

        user.record_pulse_event("friend_online", friend_online("Ana"))

        assert user.pulse_events[0]["data"]["screen_name"] == "Ana"
        assert len(user.pulse_events) == 2

    def test_different_friends_never_collapse_together(self):
        user = make_user()

        user.record_pulse_event("friend_online", friend_online("Ana"))
        user.record_pulse_event("friend_online", friend_online("Ben"))

        assert len(user.pulse_events) == 2

    def test_the_same_payload_under_a_different_event_type_is_its_own_entry(self):
        user = make_user()
        payload = friend_online("Ana")

        user.record_pulse_event("friend_online", payload)
        user.record_pulse_event("session_started", payload)

        assert len(user.pulse_events) == 2


class TestExpiry:
    def test_a_fresh_entry_is_active(self):
        user = make_user()
        user.record_pulse_event("friend_online", friend_online("Ana"))

        assert len(user.active_pulse_events()) == 1

    def test_a_lapsed_entry_is_not_returned_on_read(self):
        """Read-side expiry is what makes a scheduled cleanup unnecessary:
        nothing has to be deleted for it to stop being shown."""
        user = make_user()
        user.record_pulse_event("friend_online", friend_online("Ana"), lifetime_seconds=60)

        later = utc_now() + timedelta(seconds=61)

        assert user.active_pulse_events(now=later) == []

    def test_writing_clears_entries_that_lapsed_in_the_meantime(self):
        user = make_user()
        user.record_pulse_event("friend_online", friend_online("Stale"), lifetime_seconds=0)

        user.record_pulse_event("friend_online", friend_online("Fresh"))

        names = [entry["data"]["screen_name"] for entry in user.pulse_events]
        assert names == ["Fresh"]

    def test_entries_carry_the_expiry_the_client_enforces(self):
        user = make_user()

        entry = user.record_pulse_event("friend_online", friend_online("Ana"))

        lifetime = (
            datetime.fromisoformat(entry["expires_at"])
            - datetime.fromisoformat(entry["created_at"])
        )
        assert lifetime.total_seconds() == PULSE_EVENT_LIFETIME_SECONDS

    def test_an_entry_without_an_expiry_is_ignored_rather_than_trusted(self):
        """Defensive against a shape written before expiries existed: an entry
        that cannot say when it lapses is treated as lapsed."""
        user = make_user()
        user.pulse_events = [{"id": "x", "event_type": "friend_online", "data": {}}]

        assert user.active_pulse_events() == []
