# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Recipient contracts for the session lifecycle events.

These events look like notification plumbing, but one of them is load-bearing
elsewhere: `/notes` locks its editor while a session is live and unlocks when it
ends, and it learns about both from these broadcasts (via invalidateCampaigns).
If `session_started` reaches every campaign member but `session_paused` reaches
only those who attended, a member who never joined the session gets locked and
never unlocked.

The parameter names used to invite exactly that mistake — `session_paused` took
`active_participant_ids` and was handed every campaign member. These tests pin
the *recipients* so a future rename or "tidy-up" of a caller fails loudly here
rather than silently in another module.

DB-free: the event factories are pure.
"""

from uuid import uuid4

import pytest

from modules.session.domain.session_events import SessionEvents


@pytest.fixture
def campaign():
    """A DM plus three other members — the shape every one of these events fans out to."""
    dm_id = uuid4()
    others = [uuid4(), uuid4(), uuid4()]
    return {"dm_id": dm_id, "others": others, "all": [dm_id] + others}


class TestSessionStarted:
    def test_reaches_every_campaign_member_including_the_dm(self, campaign):
        events = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        assert sorted(str(event.user_id) for event in events) == sorted(
            str(uid) for uid in campaign["all"]
        )
        assert {event.event_type for event in events} == {"session_started"}

    def test_carries_campaign_id_so_recipients_can_tell_which_campaign(self, campaign):
        campaign_id = uuid4()
        events = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=campaign_id,
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        # /notes matches on this to decide whether the lock applies to it.
        for event in events:
            assert event.data["campaign_id"] == str(campaign_id)


class TestSessionPaused:
    """The SYSTEM take-down (expiry sweeper, admin CLI) — silent by design."""

    def test_reaches_every_campaign_member_not_only_attendees(self, campaign):
        """The one that used to be called `active_participant_ids`."""
        events = SessionEvents.session_paused(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            paused_by_id=campaign["dm_id"],
            paused_by_screen_name="Matt",
        )

        assert sorted(str(event.user_id) for event in events) == sorted(
            str(uid) for uid in campaign["all"]
        )

    def test_unlock_reaches_everyone_the_lock_reached(self, campaign):
        """Start and pause must cover the same people, or /notes locks without unlocking."""
        common = {
            "session_id": uuid4(),
            "game_id": uuid4(),
            "game_name": None,
            "campaign_id": uuid4(),
        }
        started = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
            **common,
        )
        paused = SessionEvents.session_paused(
            campaign_member_ids=campaign["all"],
            paused_by_id=campaign["dm_id"],
            paused_by_screen_name="Matt",
            **common,
        )

        assert {event.user_id for event in started} == {event.user_id for event in paused}


class TestSessionEnded:
    """The host's own End game — the only take-down players hear about."""

    def test_reaches_every_member_except_the_host(self, campaign):
        events = SessionEvents.session_ended(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        recipients = [event.user_id for event in events]
        assert sorted(str(uid) for uid in recipients) == sorted(
            str(uid) for uid in campaign["others"]
        )
        # The host is filtered inside the factory, so a caller passing the whole
        # member list (which every caller does) cannot double-notify them.
        assert campaign["dm_id"] not in recipients
        assert len(recipients) == len(set(recipients))

    def test_unlock_reaches_every_non_host_the_lock_reached(self, campaign):
        """/notes unlocks off this event, so everyone the lock reached must be
        told — except the host, whose own client already knows it ended."""
        common = {"session_id": uuid4(), "game_id": uuid4(), "game_name": None, "campaign_id": uuid4()}
        started = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
            **common,
        )
        ended = SessionEvents.session_ended(
            campaign_member_ids=campaign["all"],
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
            **common,
        )

        locked = {event.user_id for event in started} - {campaign["dm_id"]}
        assert locked == {event.user_id for event in ended}

    def test_toasts_but_never_persists(self, campaign):
        """A game ending is momentary news — worth a toast, not a notification
        row to clear later (contrast session_started, worth catching up on)."""
        events = SessionEvents.session_ended(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        assert all(event.show_toast for event in events)
        assert not any(event.save_notification for event in events)

    def test_system_take_down_stays_silent(self, campaign):
        """The sweeper's pause must NOT toast: from a user's side nothing happened."""
        events = SessionEvents.session_paused(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            paused_by_id=campaign["dm_id"],
            paused_by_screen_name="Matt",
        )

        assert not any(event.show_toast for event in events)
        assert not any(event.save_notification for event in events)


class TestSessionCreated:
    def test_excludes_the_dm_who_created_it(self, campaign):
        events = SessionEvents.session_created(
            non_dm_member_ids=campaign["others"],
            session_id=uuid4(),
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        recipients = {event.user_id for event in events}
        assert recipients == set(campaign["others"])
        assert campaign["dm_id"] not in recipients


class TestPayloadShape:
    def test_all_payload_values_are_json_safe_strings(self, campaign):
        """EventConfig.data crosses a WebSocket — UUIDs must already be stringified."""
        events = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name="The Siege of Kraghammer",  # a named game exercises the string path
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        for event in events:
            for key, value in event.data.items():
                assert value is None or isinstance(value, str), (
                    f"{key} is {type(value).__name__} — payloads carry strings or null, "
                    f"never objects the WS layer cannot serialise"
                )


class TestSessionStartedPersistence:
    """Who gets a NOTIFICATION ROW, as opposed to who gets the broadcast.

    The host performed the action, so a persisted notification telling them
    their own session started is noise they then have to clear. Everyone else
    wants the receipt.
    """

    def test_the_host_is_not_told_about_their_own_session(self, campaign):
        events = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        host_event = next(e for e in events if e.user_id == campaign["dm_id"])
        assert host_event.save_notification is False
        assert host_event.show_toast is True

    def test_every_other_member_keeps_their_notification(self, campaign):
        events = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            game_id=uuid4(),
            game_name=None,
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        member_events = [e for e in events if e.user_id != campaign["dm_id"]]
        assert len(member_events) == len(campaign["others"])
        assert all(event.save_notification for event in member_events)
