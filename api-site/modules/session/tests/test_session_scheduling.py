# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Scheduling: the GM's plan for the next game — when it is and what it is called.

`sessions.scheduled_at` and `sessions.next_game_name` are cosmetic and
communicative. Nothing starts on them, nobody is reminded by them, no rule is
enforced by them. They exist so the table can align, which is
facilitate-don't-enforce applied to coordination rather than to rules. These
tests pin what makes them trustworthy:

- they are editable only while no game is running (a "next game" cannot describe
  the one in progress), and that is a question about GAMES, so the command asks
  the game repository rather than the aggregate guessing;
- a date stores an instant, refusing naive datetimes, so every player reads the
  same moment in their own timezone;
- the name is handed to the game that starts and forgotten here, so it describes
  the night that happened rather than staying attached to the plan.

The rule that the host ending a game clears the date — and that the system
closing an abandoned one does not — is exercised end to end against the real
take-down in modules/game/tests/test_game_lifecycle.py.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.game.domain.game_aggregate import GameStatus
from modules.session.application.commands import CreateSession, ScheduleSession
from modules.session.domain.session_aggregate import SessionEntity
from modules.session.domain.session_events import SessionEvents


def run(coroutine):
    """Drive an async command from a sync test (no async plugin in this repo)."""
    return asyncio.run(coroutine)


def a_future_time():
    """A fresh aware datetime per call — never a module-level constant."""
    return datetime.now(timezone.utc) + timedelta(days=3)


def same_instant(stored, expected):
    """Compare a read-back timestamp to what was written.

    The test harness is SQLite, which has no timezone-aware type and hands back
    a naive datetime holding the UTC value SQLAlchemy stored. Production is
    PostgreSQL `timestamp with time zone`, which round-trips the offset intact.
    So the harness can only assert the INSTANT is right, not that tzinfo
    survived — that property belongs to the column type and is verified against
    the real database, not here.
    """
    if stored is not None and stored.tzinfo is None:
        stored = stored.replace(tzinfo=timezone.utc)
    return stored == expected


@pytest.fixture
def host(create_user):
    return create_user(email="dm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Alice")


@pytest.fixture
def campaign(campaign_repo, host, player, seed_default_edition):
    aggregate = CampaignAggregate.create(
        title="Curse of Strahd",
        description="Gothic horror",
        created_by=host.id,
    )
    aggregate.members[player.id] = CampaignRole.PLAYER
    campaign_repo.save(aggregate)
    return aggregate


@pytest.fixture
def session(campaign, campaign_repo, session_repo, mock_event_manager):
    return run(CreateSession(session_repo, campaign_repo, mock_event_manager).execute(
        campaign_id=campaign.id,
        host_id=campaign.created_by,
    ))


class TestScheduleRules:
    """The aggregate's own rules — pure, no repositories."""

    def test_set_and_clear_while_idle(self):
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        when = a_future_time()

        entity.schedule(when, "The Siege of Kraghammer")
        assert entity.scheduled_at == when
        assert entity.next_game_name == "The Siege of Kraghammer"

        entity.schedule(None, None)
        assert entity.scheduled_at is None
        assert entity.next_game_name is None

    def test_naive_datetimes_are_refused(self):
        """A wall-clock reading with no zone would be read as server-local and
        show the wrong time to everyone but the server."""
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())

        with pytest.raises(ValueError, match="timezone-aware"):
            entity.schedule(datetime(2026, 9, 10, 20, 0))

    def test_a_past_time_is_allowed(self):
        """Deliberately legal: the record of what the GM said outlives the date.
        Hiding a stale value is a display rule, not a data rule."""
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        yesterday = datetime.now(timezone.utc) - timedelta(days=1)

        entity.schedule(yesterday)

        assert entity.scheduled_at == yesterday

    def test_a_name_without_a_date_is_allowed(self):
        """A GM who knows what the next game is but not when can say so."""
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())

        entity.schedule(None, "The Siege of Kraghammer")

        assert entity.scheduled_at is None
        assert entity.next_game_name == "The Siege of Kraghammer"

    def test_a_blank_name_clears_rather_than_stores(self):
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        entity.schedule(None, "  ")
        assert entity.next_game_name is None

    def test_an_overlong_name_is_refused(self):
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())

        with pytest.raises(ValueError, match="100 characters"):
            entity.schedule(None, "x" * 101)

    def test_the_name_is_consumed_once(self):
        """Start takes it; the plan forgets it. Leaving it would re-apply the
        same name to the following game, and a GM editing it afterwards would
        be editing the plan rather than the night that happened."""
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        entity.schedule(None, "The Siege of Kraghammer")

        assert entity.consume_next_game_name() == "The Siege of Kraghammer"
        assert entity.next_game_name is None
        assert entity.consume_next_game_name() is None

    def test_clearing_the_schedule_leaves_the_name_alone(self):
        """clear_schedule runs inside the take-down, by which point the name has
        already left with the game. Only the date is "next" any more."""
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        entity.schedule(a_future_time(), "The Siege of Kraghammer")

        entity.clear_schedule()

        assert entity.scheduled_at is None
        assert entity.next_game_name == "The Siege of Kraghammer"


class FakeGameRepositoryWithOpenGame:
    """A game repository that always reports something running."""

    def __init__(self, status=GameStatus.ACTIVE):
        self.status = status

    def get_open_game_for_session(self, session_id):
        return object()


class TestScheduleSessionCommand:
    def test_host_can_set_both(self, session, campaign_repo, session_repo, user_repo, mock_event_manager, host):
        when = a_future_time()

        run(ScheduleSession(session_repo, campaign_repo, user_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id, scheduled_at=when,
            next_game_name="The Siege of Kraghammer"
        ))

        stored = session_repo.get_by_id(session.id)
        assert same_instant(stored.scheduled_at, when)
        assert stored.next_game_name == "The Siege of Kraghammer"

    def test_a_player_cannot(self, session, campaign_repo, session_repo, user_repo, mock_event_manager, player):
        with pytest.raises(ValueError, match="Only the host"):
            run(ScheduleSession(session_repo, campaign_repo, user_repo, mock_event_manager).execute(
                session_id=session.id, host_id=player.id, scheduled_at=a_future_time()
            ))

        assert session_repo.get_by_id(session.id).scheduled_at is None

    def test_refused_while_a_game_is_running(
        self, session, campaign_repo, session_repo, user_repo, mock_event_manager, host
    ):
        """A "next game" cannot describe the one in progress. The command asks
        the game repository, because liveness is not the session's to know."""
        schedule = ScheduleSession(
            session_repo, campaign_repo, user_repo, mock_event_manager,
            FakeGameRepositoryWithOpenGame(),
        )

        with pytest.raises(ValueError, match="End the game before"):
            run(schedule.execute(
                session_id=session.id, host_id=host.id, scheduled_at=a_future_time()
            ))

        assert session_repo.get_by_id(session.id).scheduled_at is None

    def test_clearing_is_broadcast_too(self, session, campaign_repo, session_repo, user_repo, mock_event_manager, host):
        """A cancelled game is worth hearing about — the same event carries null."""
        schedule = ScheduleSession(session_repo, campaign_repo, user_repo, mock_event_manager)
        run(schedule.execute(session_id=session.id, host_id=host.id, scheduled_at=a_future_time()))
        mock_event_manager.broadcast.reset_mock()

        run(schedule.execute(session_id=session.id, host_id=host.id, scheduled_at=None))

        assert session_repo.get_by_id(session.id).scheduled_at is None
        broadcast_payloads = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]
        assert broadcast_payloads, "clearing the schedule must still tell the players"
        assert all(event.data["scheduled_at"] is None for event in broadcast_payloads)


class TestScheduledEventRecipients:
    def test_reaches_every_member_except_the_host(self):
        dm_id = uuid4()
        others = [uuid4(), uuid4()]

        events = SessionEvents.session_scheduled(
            campaign_member_ids=[dm_id] + others,
            session_id=uuid4(),
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=dm_id,
            host_screen_name="Matt",
            scheduled_at=a_future_time(),
        )

        assert {event.user_id for event in events} == set(others)

    def test_toasts_and_persists(self):
        """The one lifecycle event worth finding again later — "when did he say
        we were playing?" — unlike a game merely starting or ending."""
        dm_id = uuid4()
        events = SessionEvents.session_scheduled(
            campaign_member_ids=[dm_id, uuid4()],
            session_id=uuid4(),
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=dm_id,
            host_screen_name="Matt",
            scheduled_at=a_future_time(),
        )

        assert all(event.show_toast for event in events)
        assert all(event.save_notification for event in events)

    def test_carries_the_planned_name(self):
        dm_id = uuid4()
        events = SessionEvents.session_scheduled(
            campaign_member_ids=[dm_id, uuid4()],
            session_id=uuid4(),
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=dm_id,
            host_screen_name="Matt",
            scheduled_at=a_future_time(),
            next_game_name="The Siege of Kraghammer",
        )

        assert all(event.data["next_game_name"] == "The Siege of Kraghammer" for event in events)

    def test_payload_is_json_safe(self):
        dm_id = uuid4()
        events = SessionEvents.session_scheduled(
            campaign_member_ids=[dm_id, uuid4()],
            session_id=uuid4(),
            campaign_id=uuid4(),
            campaign_name="Curse of Strahd",
            host_id=dm_id,
            host_screen_name="Matt",
            scheduled_at=a_future_time(),
            next_game_name="The Siege of Kraghammer",
        )

        for event in events:
            for key, value in event.data.items():
                assert value is None or isinstance(value, str), f"{key} is {type(value).__name__}"
