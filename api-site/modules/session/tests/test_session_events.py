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
            session_name="Session 12",
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
            session_name="Session 12",
            campaign_id=campaign_id,
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        # /notes matches on this to decide whether the lock applies to it.
        for event in events:
            assert event.data["campaign_id"] == str(campaign_id)


class TestSessionPaused:
    def test_reaches_every_campaign_member_not_only_attendees(self, campaign):
        """The one that used to be called `active_participant_ids`."""
        events = SessionEvents.session_paused(
            campaign_member_ids=campaign["all"],
            session_id=uuid4(),
            session_name="Session 12",
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
            "session_name": "Session 12",
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


class TestSessionFinished:
    def test_reaches_the_dm_and_every_other_member_exactly_once(self, campaign):
        events = SessionEvents.session_finished(
            dm_id=campaign["dm_id"],
            non_dm_member_ids=campaign["others"],
            session_id=uuid4(),
            session_name="Session 12",
            campaign_id=uuid4(),
        )

        recipients = [event.user_id for event in events]
        assert sorted(str(uid) for uid in recipients) == sorted(
            str(uid) for uid in campaign["all"]
        )
        # The DM is passed separately; a caller that also left them in the member
        # list would double-notify.
        assert len(recipients) == len(set(recipients))

    def test_unlock_reaches_everyone_the_lock_reached(self, campaign):
        common = {"session_id": uuid4(), "session_name": "Session 12", "campaign_id": uuid4()}
        started = SessionEvents.session_started(
            campaign_member_ids=campaign["all"],
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
            **common,
        )
        finished = SessionEvents.session_finished(
            dm_id=campaign["dm_id"], non_dm_member_ids=campaign["others"], **common
        )

        assert {event.user_id for event in started} == {event.user_id for event in finished}


class TestSessionCreated:
    def test_excludes_the_dm_who_created_it(self, campaign):
        events = SessionEvents.session_created(
            non_dm_member_ids=campaign["others"],
            session_id=uuid4(),
            session_name="Session 12",
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
            session_name="Session 12",
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=campaign["dm_id"],
            host_screen_name="Matt",
        )

        for event in events:
            for key, value in event.data.items():
                assert isinstance(value, str), f"{key} is {type(value).__name__}, not str"
