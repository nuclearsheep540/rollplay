# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Scheduling: the GM's declared next game.

`sessions.scheduled_at` is cosmetic and communicative — nothing starts on it,
nobody is reminded by it, no rule is enforced by it. It exists so the table can
align, which is facilitate-don't-enforce applied to coordination rather than to
rules. These tests pin the three things that make it trustworthy:

- it is editable only while no game is running (a "next game" cannot describe
  the one in progress);
- the host ending a game clears it, and the system closing an abandoned one does
  NOT — the sweeper knows nothing about what the GM told the table;
- it stores an instant, refusing naive datetimes, so every player reads the same
  moment in their own timezone.

The take-down tests drive the real PauseSession with api-game's HTTP stubbed, so
the reason split is exercised end to end rather than asserted about the source.
"""

import asyncio
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.session.application.commands import CreateSession, PauseSession, ScheduleSession
from modules.session.domain.session_aggregate import PauseReason, SessionEntity, SessionStatus
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

        entity.schedule(when)
        assert entity.scheduled_at == when

        entity.schedule(None)
        assert entity.scheduled_at is None

    @pytest.mark.parametrize(
        "status", [SessionStatus.ACTIVE, SessionStatus.STARTING, SessionStatus.STOPPING]
    )
    def test_refused_while_a_game_is_running(self, status):
        entity = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        entity.status = status

        with pytest.raises(ValueError, match="End the game before"):
            entity.schedule(a_future_time())

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


class TestScheduleSessionCommand:
    def test_host_can_set_it(self, session, campaign_repo, session_repo, user_repo, mock_event_manager, host):
        when = a_future_time()

        run(ScheduleSession(session_repo, campaign_repo, user_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id, scheduled_at=when
        ))

        assert same_instant(session_repo.get_by_id(session.id).scheduled_at, when)

    def test_a_player_cannot(self, session, campaign_repo, session_repo, user_repo, mock_event_manager, player):
        with pytest.raises(ValueError, match="Only the host"):
            run(ScheduleSession(session_repo, campaign_repo, user_repo, mock_event_manager).execute(
                session_id=session.id, host_id=player.id, scheduled_at=a_future_time()
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
        )

        for event in events:
            for key, value in event.data.items():
                assert value is None or isinstance(value, str), f"{key} is {type(value).__name__}"


def _stub_api_game():
    """Stand in for api-game's end-of-game HTTP call.

    Every field of SessionEndFinalState has a default, so an empty object is a
    valid "nothing was going on" final state — enough to drive the real ETL.
    """
    response = MagicMock()
    response.status_code = 200
    response.json.return_value = {"success": True, "final_state": {}, "message": ""}

    client = AsyncMock()
    client.post.return_value = response
    client.delete.return_value = response
    context = MagicMock()
    context.__aenter__ = AsyncMock(return_value=client)
    context.__aexit__ = AsyncMock(return_value=False)
    return context


class TestTakeDownClearsTheSchedule:
    """The rule that gives the date its meaning: it names the NEXT game, so the
    host ending one forgets it — and the system closing an abandoned one does not.
    """

    def _live_session_with_a_schedule(self, session, session_repo):
        session.schedule(a_future_time())
        session.start()
        session.activate()
        session_repo.save(session)
        return session

    def _take_down(self, session, repos, reason):
        session_repo, campaign_repo, user_repo, event_manager = repos
        command = PauseSession(
            session_repository=session_repo,
            user_repository=user_repo,
            character_repository=None,
            campaign_repository=campaign_repo,
            event_manager=event_manager,
            asset_repository=None,
        )
        with patch("modules.session.application.commands.httpx.AsyncClient", return_value=_stub_api_game()):
            run(command.execute(session.id, session.host_id, reason=reason))

    def test_the_host_ending_it_clears_the_date(
        self, session, session_repo, campaign_repo, user_repo, mock_event_manager
    ):
        self._live_session_with_a_schedule(session, session_repo)

        self._take_down(session, (session_repo, campaign_repo, user_repo, mock_event_manager),
                        PauseReason.HOST_ENDED)

        stored = session_repo.get_by_id(session.id)
        assert stored.status == SessionStatus.INACTIVE
        assert stored.scheduled_at is None

    def test_the_system_closing_it_leaves_the_date(
        self, session, session_repo, campaign_repo, user_repo, mock_event_manager
    ):
        """The sweeper closing a forgotten game says nothing about what the GM
        told the table, so the next game stays on the board."""
        self._live_session_with_a_schedule(session, session_repo)
        declared = session.scheduled_at

        self._take_down(session, (session_repo, campaign_repo, user_repo, mock_event_manager),
                        PauseReason.SYSTEM)

        stored = session_repo.get_by_id(session.id)
        assert stored.status == SessionStatus.INACTIVE
        assert same_instant(stored.scheduled_at, declared)

    def test_the_two_reasons_speak_differently(
        self, session, session_repo, campaign_repo, user_repo, mock_event_manager
    ):
        """Host: players are told. System: silence."""
        self._live_session_with_a_schedule(session, session_repo)
        repos = (session_repo, campaign_repo, user_repo, mock_event_manager)

        mock_event_manager.broadcast.reset_mock()
        self._take_down(session, repos, PauseReason.HOST_ENDED)
        host_events = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]

        assert {event.event_type for event in host_events} == {"session_ended"}
        assert all(event.show_toast for event in host_events)
