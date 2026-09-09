# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The Game aggregate: one play, its lifecycle, and the state it leaves behind.

A game owns what a session used to carry by accident. Its id is the api-game
room id; while it is open a MongoDB room exists under that id; when it ends it
becomes the record of the night AND the thing the next game seeds from.

These tests pin the properties that make that safe:

- the transitions, including that a game which never activated is deleted rather
  than ended (a phantom would be a wrong answer under "newest ended game");
- continuity: a new game opens from the previous game's state, and the session
  row is not written by starting or ending one;
- the reason split: the host ending a game speaks and clears the schedule, the
  system closing one is silent and leaves it;
- attendance, recorded once from what api-game saw;
- that no play state ever reaches the wire.

api-game's HTTP is stubbed so the real commands run end to end rather than being
asserted about from the outside.
"""

import asyncio
import json
from datetime import datetime, timedelta, timezone
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.game.api.schemas import GameResponse
from modules.game.application.commands import (
    DisconnectFromGame,
    EndGame,
    StartGame,
    UpdateGame,
    _build_attendance,
)
from modules.game.domain.game_aggregate import (
    Attendee,
    EndReason,
    GameAggregate,
    GameStatus,
)
from modules.session.application.commands import CreateSession


def run(coroutine):
    """Drive an async command from a sync test (no async plugin in this repo)."""
    return asyncio.run(coroutine)


def a_log_line(message):
    """A LogEntry-shaped dict — the start payload is contract-validated, so a
    loose stand-in would fail on the way out rather than proving anything."""
    return {
        "message": message,
        "type": "system",
        "timestamp": "2026-09-06T20:00:00+00:00",
        "from_player": None,
        "log_id": 1,
        "prompt_id": None,
    }


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


class ApiGameStub:
    """Stands in for api-game's HTTP surface, echoing the id it was handed.

    Start must echo the game id back or the command's tripwire fires — which is
    the point of the tripwire, so the stub honours it rather than hard-coding a
    value. Every field of SessionEndFinalState has a default, so an empty object
    is a valid "nothing was going on" final state.
    """

    def __init__(self, final_state=None, echo_game_id=None):
        self.final_state = final_state if final_state is not None else {}
        self.start_payloads = []
        # Room ids this stub was asked to delete — how a test sees whether the
        # hot room was cleaned up.
        self.deleted_room_ids = []
        # When set, the start response echoes THIS id instead of the one it was
        # sent, tripping the command's id check after the room already exists.
        self.echo_game_id = echo_game_id

    def __call__(self, *args, **kwargs):
        client = AsyncMock()

        async def post(url, **request_kwargs):
            response = MagicMock()
            response.status_code = 200
            body = request_kwargs.get("json") or {}
            if url.endswith("/game/session/start"):
                self.start_payloads.append(body)
                response.json.return_value = {
                    "success": True,
                    "game_id": self.echo_game_id or body.get("game_id"),
                    "message": "",
                }
            else:
                response.json.return_value = {
                    "success": True,
                    "final_state": self.final_state,
                    "message": "",
                }
            return response

        async def delete(url, **request_kwargs):
            self.deleted_room_ids.append(url.rsplit("/", 1)[-1])
            deleted = MagicMock()
            deleted.status_code = 200
            deleted.json.return_value = {"success": True}
            return deleted

        client.post = AsyncMock(side_effect=post)
        client.delete = AsyncMock(side_effect=delete)

        context = MagicMock()
        context.__aenter__ = AsyncMock(return_value=client)
        context.__aexit__ = AsyncMock(return_value=False)
        return context


def start_a_game(session, repos, api_game=None, **kwargs):
    """Run the real StartGame with api-game stubbed and the UX delay removed."""
    game_repo, session_repo, user_repo, campaign_repo, event_manager = repos
    api_game = api_game or ApiGameStub()
    command = StartGame(
        game_repository=game_repo,
        session_repository=session_repo,
        user_repository=user_repo,
        character_repository=MagicMock(get_user_character_for_campaign=lambda *a: None),
        campaign_repository=campaign_repo,
        event_manager=event_manager,
        asset_repository=None,
        s3_service=None,
    )
    with patch("modules.game.application.commands.httpx.AsyncClient", side_effect=api_game), \
         patch("modules.game.application.commands.asyncio.sleep", new=AsyncMock()):
        return run(command.execute(session.id, session.host_id, **kwargs))


def end_a_game(game, repos, reason, api_game=None, **kwargs):
    """Run the real EndGame with api-game stubbed."""
    game_repo, session_repo, user_repo, campaign_repo, event_manager = repos
    command = EndGame(
        game_repository=game_repo,
        session_repository=session_repo,
        user_repository=user_repo,
        character_repository=None,
        campaign_repository=campaign_repo,
        event_manager=event_manager,
        asset_repository=None,
    )
    with patch("modules.game.application.commands.httpx.AsyncClient", side_effect=api_game or ApiGameStub()), \
         patch("modules.game.application.commands.asyncio.create_task", new=lambda coroutine: coroutine.close()):
        return run(command.execute(game.id, game.host_id, reason=reason, **kwargs))


@pytest.fixture
def repos(game_repo, session_repo, user_repo, campaign_repo, mock_event_manager):
    return (game_repo, session_repo, user_repo, campaign_repo, mock_event_manager)


class TestGameAggregateTransitions:
    """Pure aggregate rules — no repositories, no database."""

    @staticmethod
    def _new_game(name=None):
        return GameAggregate.create(
            session_id=uuid4(), campaign_id=uuid4(), host_id=uuid4(), name=name
        )

    def test_create_starts_at_starting_with_no_state(self):
        game = self._new_game()

        assert game.status is GameStatus.STARTING
        assert game.is_open
        assert game.started_at is None
        assert game.attendance == []
        assert game.map_token_seed is None

    def test_activate_stamps_the_seed_and_the_time(self):
        game = self._new_game()
        seed = {"map-1": [{"id": "npc-1"}]}
        lease = datetime.now(timezone.utc) + timedelta(hours=6)

        game.activate(lease, seed)

        assert game.status is GameStatus.ACTIVE
        assert game.started_at is not None
        assert game.urls_expire_at == lease
        assert game.map_token_seed == seed

    @pytest.mark.parametrize("status", [GameStatus.ACTIVE, GameStatus.ENDING, GameStatus.ENDED])
    def test_only_a_starting_game_activates(self, status):
        game = self._new_game()
        game.status = status

        with pytest.raises(ValueError, match="starting game"):
            game.activate(None, {})

    @pytest.mark.parametrize("status", [GameStatus.STARTING, GameStatus.ENDING, GameStatus.ENDED])
    def test_only_a_running_game_ends(self, status):
        game = self._new_game()
        game.status = status

        with pytest.raises(ValueError, match="running game"):
            game.begin_end()

    def test_record_end_state_copies_exactly_the_seven_fields(self):
        game = self._new_game()
        game.activate(None, {"map-1": ["seeded"]})
        game.begin_end()
        extracted = MagicMock(
            audio_config={"bgm": {"asset_id": "a"}},
            spotify_config={"track_uri": "spotify:x"},
            map_config={"asset_id": "map-1"},
            image_config={},
            active_display="map",
            adventure_log=[{"line": "rolled a 20"}],
            map_token_state={"map-1": ["moved"]},
        )

        game.record_end_state(extracted)

        assert game.map_token_state == {"map-1": ["moved"]}
        assert game.adventure_log == [{"line": "rolled a 20"}]
        assert game.active_display == "map"
        # The seed belongs to the game's START and must survive its END: it is
        # the diff base the next game's merge reads.
        assert game.map_token_seed == {"map-1": ["seeded"]}

    def test_record_end_state_refused_outside_ending(self):
        game = self._new_game()
        game.activate(None, {})

        with pytest.raises(ValueError, match="ending game"):
            game.record_end_state(MagicMock())

    def test_end_closes_it_for_good(self):
        game = self._new_game()
        game.activate(None, {})
        game.begin_end()
        attendance = [Attendee(user_id=uuid4(), character_id=None)]

        game.end(EndReason.HOST, attendance)

        assert game.status is GameStatus.ENDED
        assert not game.is_open
        assert game.ended_at is not None
        assert game.ended_by is EndReason.HOST
        assert game.attendance == attendance
        assert game.urls_expire_at is None

    def test_abort_end_returns_it_to_live(self):
        game = self._new_game()
        game.activate(None, {})
        game.begin_end()

        game.abort_end()

        assert game.status is GameStatus.ACTIVE

    def test_rename_trims_blanks_and_caps(self):
        game = self._new_game()

        game.rename("  The Siege of Kraghammer  ")
        assert game.name == "The Siege of Kraghammer"

        game.rename("   ")
        assert game.name is None

        with pytest.raises(ValueError, match="100 characters"):
            game.rename("x" * 101)

    def test_summarise_trims_and_blanks(self):
        game = self._new_game()
        game.summarise("  The party fled north.  ")
        assert game.summary == "The party fled north."
        game.summarise("")
        assert game.summary is None


class TestAttendance:
    def test_one_entry_per_person_first_seat_wins(self):
        """Someone who took two seats over an evening is still one person who
        was there — and the character they arrived with is the one recorded."""
        user_id, first_character, second_character = uuid4(), uuid4(), uuid4()
        players = [
            MagicMock(user_id=str(user_id), character_id=str(first_character)),
            MagicMock(user_id=str(user_id), character_id=str(second_character)),
        ]

        attendance = _build_attendance(players)

        assert attendance == [Attendee(user_id=user_id, character_id=first_character)]

    def test_a_seat_without_a_character_still_counts(self):
        """Spectators and moderators were at the table too."""
        user_id = uuid4()
        attendance = _build_attendance([MagicMock(user_id=str(user_id), character_id=None)])

        assert attendance == [Attendee(user_id=user_id, character_id=None)]


class TestStartGame:
    def test_mints_an_active_game_addressed_by_its_own_id(self, session, repos, game_repo):
        api_game = ApiGameStub()
        game = start_a_game(session, repos, api_game)

        assert game.status is GameStatus.ACTIVE
        assert game_repo.get_open_game_for_session(session.id).id == game.id
        # The id we minted is the room id api-game was told to key by.
        assert api_game.start_payloads[0]["game_id"] == str(game.id)

    def test_refuses_a_second_game_while_one_is_open(self, session, repos):
        start_a_game(session, repos)

        with pytest.raises(ValueError, match="already running"):
            start_a_game(session, repos)

    def test_only_the_host_may_start(self, session, repos, player, game_repo):
        game_repo_, session_repo, user_repo, campaign_repo, event_manager = repos
        command = StartGame(
            game_repository=game_repo_, session_repository=session_repo,
            user_repository=user_repo, character_repository=MagicMock(),
            campaign_repository=campaign_repo, event_manager=event_manager,
        )
        with pytest.raises(ValueError, match="Only the host"):
            run(command.execute(session.id, player.id))

    def test_a_failed_start_leaves_no_row_behind(self, session, repos, game_repo, session_repo):
        """An unstarted game is not history. Leaving a STARTING row would also
        block every future start through the one-open-game index."""
        exploding = MagicMock(side_effect=RuntimeError("api-game is down"))

        with pytest.raises(ValueError, match="Failed to start game"), \
             patch("modules.game.application.commands.httpx.AsyncClient", exploding), \
             patch("modules.game.application.commands.asyncio.sleep", new=AsyncMock()):
            game_repo_, session_repo_, user_repo, campaign_repo, event_manager = repos
            run(StartGame(
                game_repository=game_repo_, session_repository=session_repo_,
                user_repository=user_repo,
                character_repository=MagicMock(get_user_character_for_campaign=lambda *a: None),
                campaign_repository=campaign_repo, event_manager=event_manager,
            ).execute(session.id, session.host_id))

        assert game_repo.get_open_game_for_session(session.id) is None
        assert game_repo.get_ended_games_for_session(session.id) == []

    def test_a_failed_start_takes_the_hot_room_down_with_it(self, session, repos, game_repo):
        """The room can outlive the row: api-game builds it, and every step after
        that can still fail. Deleting only the cold row would leave it hot and
        unreachable, keyed by an id no row names any more."""
        # Echoing the wrong id trips the command's tripwire AFTER the room exists.
        api_game = ApiGameStub(echo_game_id=str(uuid4()))

        with pytest.raises(ValueError, match="Failed to start game"):
            start_a_game(session, repos, api_game)

        started = api_game.start_payloads[0]["game_id"]
        assert api_game.deleted_room_ids == [started], "the hot room was left behind"
        assert game_repo.get_open_game_for_session(session.id) is None

    def test_a_failed_start_keeps_the_planned_name(self, session, repos, session_repo):
        """The plan survives so the GM can simply press Start again."""
        session.name_next_game("The Siege of Kraghammer")
        session_repo.save(session)
        exploding = MagicMock(side_effect=RuntimeError("api-game is down"))

        with pytest.raises(ValueError), \
             patch("modules.game.application.commands.httpx.AsyncClient", exploding), \
             patch("modules.game.application.commands.asyncio.sleep", new=AsyncMock()):
            game_repo_, session_repo_, user_repo, campaign_repo, event_manager = repos
            run(StartGame(
                game_repository=game_repo_, session_repository=session_repo_,
                user_repository=user_repo,
                character_repository=MagicMock(get_user_character_for_campaign=lambda *a: None),
                campaign_repository=campaign_repo, event_manager=event_manager,
            ).execute(session.id, session.host_id))

        assert session_repo.get_by_id(session.id).next_game_name == "The Siege of Kraghammer"

    def test_takes_the_planned_name_and_clears_the_plan(self, session, repos, session_repo):
        session.name_next_game("The Siege of Kraghammer")
        session_repo.save(session)

        game = start_a_game(session, repos)

        assert game.name == "The Siege of Kraghammer"
        assert session_repo.get_by_id(session.id).next_game_name is None

    def test_stamps_the_campaign_as_played(self, session, repos, campaign, campaign_repo):
        assert campaign_repo.get_by_id(campaign.id).last_played_at is None

        start_a_game(session, repos)

        assert campaign_repo.get_by_id(campaign.id).last_played_at is not None

    def test_leaves_the_session_row_otherwise_untouched(self, session, repos, session_repo):
        before = session_repo.get_by_id(session.id)

        start_a_game(session, repos)

        after = session_repo.get_by_id(session.id)
        assert after.scheduled_at == before.scheduled_at
        assert set(after.joined_users) == set(before.joined_users)
        assert after.campaign_id == before.campaign_id


class TestTheRepositoryLeavesAUsableSession:
    """A failed commit must roll back before the caller's next statement.

    SQLAlchemy refuses every statement on a session whose commit failed until
    someone rolls back. StartGame's error path is a real caller of that: it
    deletes the STARTING row it could not activate. Without the rollback the
    delete raised too, the original error was masked, and the phantom row then
    blocked that session's next start through the one-open-game index.
    """

    def test_save_rolls_back_when_the_commit_fails(self, game_repo, session, campaign, host):
        game = GameAggregate.create(
            session_id=session.id, campaign_id=campaign.id, host_id=host.id,
        )

        with patch.object(game_repo.db, "commit", side_effect=RuntimeError("db is gone")), \
             patch.object(game_repo.db, "rollback") as rollback:
            with pytest.raises(RuntimeError, match="db is gone"):
                game_repo.save(game)

        rollback.assert_called_once()

    def test_delete_rolls_back_when_the_commit_fails(self, game_repo, session, campaign, host):
        game = GameAggregate.create(
            session_id=session.id, campaign_id=campaign.id, host_id=host.id,
        )
        game_repo.save(game)

        with patch.object(game_repo.db, "commit", side_effect=RuntimeError("db is gone")), \
             patch.object(game_repo.db, "rollback") as rollback:
            with pytest.raises(RuntimeError, match="db is gone"):
                game_repo.delete(game.id)

        rollback.assert_called_once()


class TestContinuity:
    """A new game opens where the last one left off. This is the 06 fix, kept."""

    def test_the_room_opens_from_the_previous_game(self, session, repos, create_game, campaign):
        create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
            status=GameStatus.ENDED,
            adventure_log=[a_log_line("the party fled north")],
            spotify_config={"track_uri": "spotify:track:dirge"},
            active_display="map",
        )
        api_game = ApiGameStub()

        start_a_game(session, repos, api_game)

        payload = api_game.start_payloads[0]
        assert payload["adventure_log"] == [a_log_line("the party fled north")]
        assert payload["active_display"] == "map"
        # SpotifyState fills its own defaults, so assert the carried field
        # rather than the whole block.
        assert payload["spotify_state"]["track_uri"] == "spotify:track:dirge"

    def test_the_first_game_of_a_session_opens_empty(self, session, repos):
        api_game = ApiGameStub()

        start_a_game(session, repos, api_game)

        payload = api_game.start_payloads[0]
        assert payload["adventure_log"] == []
        assert payload["active_display"] is None

    def test_the_newest_ended_game_wins(self, session, repos, create_game, campaign):
        """Ordered by ended_at: it is the state left most recently that continuity means."""
        older = create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
            status=GameStatus.ENDED, adventure_log=[a_log_line("older")],
        )
        newer = create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
            status=GameStatus.ENDED, adventure_log=[a_log_line("newer")],
        )
        older.ended_at = datetime.utcnow() - timedelta(days=2)
        newer.ended_at = datetime.utcnow()
        repos[0].save(older)
        repos[0].save(newer)
        api_game = ApiGameStub()

        start_a_game(session, repos, api_game)

        assert api_game.start_payloads[0]["adventure_log"] == [a_log_line("newer")]

    def test_pc_tokens_come_back_only_from_a_previous_board(self):
        """WHY the session outlives its games, at the merge that proves it.

        npc tokens re-seed from the workshop baseline whatever happens; pc
        tokens exist ONLY on the previous board. So a game that seeds from its
        predecessor restores the players' pieces, and one that seeds from
        nothing cannot — which is the bug the one-session model removed and
        this model keeps removed.
        """
        from modules.session.domain.token_merge import merge_token_boards

        def npc():
            return {
                "id": str(uuid4()), "kind": "npc", "owner_user_id": None,
                "character_id": None, "label": "Pit Trap", "x": 350.0, "y": 650.0,
                "footprint": 1, "created_by": "dm", "updated_at": None,
                "hidden": True, "locked": False,
            }

        def pc(owner):
            return {
                "id": str(uuid4()), "kind": "pc", "owner_user_id": str(owner),
                "character_id": None, "label": "Aelwyn", "x": 120.0, "y": 240.0,
                "footprint": 1, "created_by": "alice", "updated_at": None,
                "hidden": False, "locked": False,
            }

        baseline = [npc()]
        played_board = [pc(uuid4())] + [dict(token) for token in baseline]

        from_previous = merge_token_boards(
            seed_tokens=baseline, board_tokens=played_board, baseline_tokens=baseline
        )
        from_nothing = merge_token_boards(
            seed_tokens=[], board_tokens=[], baseline_tokens=baseline
        )

        assert [token["kind"] for token in from_previous].count("pc") == 1
        assert not any(token["kind"] == "pc" for token in from_nothing)


class TestEndGame:
    def test_the_state_lands_on_the_game_not_the_session(
        self, session, repos, game_repo, session_repo
    ):
        game = start_a_game(session, repos)
        api_game = ApiGameStub(final_state={
            "adventure_log": [a_log_line("rolled a 20")],
            "active_display": "map",
        })

        end_a_game(game, repos, EndReason.HOST, api_game)

        stored_game = game_repo.get_by_id(game.id)
        assert stored_game.status is GameStatus.ENDED
        assert stored_game.active_display == "map"
        assert len(stored_game.adventure_log) == 1

        stored_session = session_repo.get_by_id(session.id)
        for game_shaped in ("adventure_log", "active_display", "map_token_state"):
            assert not hasattr(stored_session, game_shaped)

    def test_the_host_ending_it_clears_the_date(self, session, repos, session_repo):
        when = datetime.now(timezone.utc) + timedelta(days=3)
        session.schedule(when, "The Siege of Kraghammer")
        session_repo.save(session)
        game = start_a_game(session, repos)

        end_a_game(game, repos, EndReason.HOST)

        assert session_repo.get_by_id(session.id).scheduled_at is None

    def test_the_system_closing_it_leaves_the_date(self, session, repos, session_repo):
        """The sweeper closing a forgotten game says nothing about what the GM
        told the table, so the next game stays on the board."""
        when = datetime.now(timezone.utc) + timedelta(days=3)
        session.schedule(when)
        session_repo.save(session)
        game = start_a_game(session, repos)

        end_a_game(game, repos, EndReason.SYSTEM)

        assert session_repo.get_by_id(session.id).scheduled_at is not None

    def test_the_two_reasons_speak_differently(self, session, repos, mock_event_manager):
        game = start_a_game(session, repos)
        mock_event_manager.broadcast.reset_mock()

        end_a_game(game, repos, EndReason.HOST)
        host_events = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]

        assert {event.event_type for event in host_events} == {"session_ended"}
        assert all(event.show_toast for event in host_events)

    def test_the_system_take_down_stays_silent(self, session, repos, mock_event_manager):
        game = start_a_game(session, repos)
        mock_event_manager.broadcast.reset_mock()

        end_a_game(game, repos, EndReason.SYSTEM)
        system_events = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]

        assert {event.event_type for event in system_events} == {"session_paused"}
        assert not any(event.show_toast for event in system_events)

    def test_records_who_was_at_the_table(self, session, repos, game_repo, host):
        game = start_a_game(session, repos)
        api_game = ApiGameStub(final_state={
            "players": [{"user_id": str(host.id), "player_name": "Matt", "seat_position": 0}],
        })

        end_a_game(game, repos, EndReason.HOST, api_game)

        stored = game_repo.get_by_id(game.id)
        assert [attendee.user_id for attendee in stored.attendance] == [host.id]

    def test_the_record_can_be_written_as_it_ends(self, session, repos, game_repo):
        game = start_a_game(session, repos)

        end_a_game(
            game, repos, EndReason.HOST,
            name="The Siege of Kraghammer",
            summary="The party fled north.",
        )

        stored = game_repo.get_by_id(game.id)
        assert stored.name == "The Siege of Kraghammer"
        assert stored.summary == "The party fled north."

    def test_the_wrap_up_can_set_the_next_game(self, session, repos, session_repo):
        """One act: this one happened, the next is Thursday.

        Ending clears the date, so a separate schedule call afterwards could
        half-fail and leave the table with none — which is why the wrap-up
        carries it instead.
        """
        when = datetime.now(timezone.utc) + timedelta(days=7)
        game = start_a_game(session, repos)

        end_a_game(
            game, repos, EndReason.HOST,
            next_scheduled_at=when, next_game_name="The Siege of Kraghammer",
        )

        stored = session_repo.get_by_id(session.id)
        assert stored.scheduled_at is not None
        assert stored.next_game_name == "The Siege of Kraghammer"

    def test_the_wrap_up_replaces_the_date_it_just_cleared(self, session, repos, session_repo):
        """The old date named the game that just ended; the new one replaces it
        rather than being cleared alongside it."""
        old_date = datetime.now(timezone.utc) + timedelta(days=1)
        new_date = datetime.now(timezone.utc) + timedelta(days=7)
        session.schedule(old_date)
        session_repo.save(session)
        game = start_a_game(session, repos)

        end_a_game(game, repos, EndReason.HOST, next_scheduled_at=new_date)

        stored = session_repo.get_by_id(session.id)
        assert stored.scheduled_at is not None
        assert abs((stored.scheduled_at.replace(tzinfo=timezone.utc) - new_date).total_seconds()) < 1

    def test_the_wrap_up_tells_the_players_the_next_date(self, session, repos, mock_event_manager):
        when = datetime.now(timezone.utc) + timedelta(days=7)
        game = start_a_game(session, repos)
        mock_event_manager.broadcast.reset_mock()

        end_a_game(game, repos, EndReason.HOST, next_scheduled_at=when)

        broadcast = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]
        types = {event.event_type for event in broadcast}
        assert types == {"session_ended", "session_scheduled"}
        # session_scheduled persists so a player can find it later; the ending
        # itself is momentary news and does not.
        scheduled = [event for event in broadcast if event.event_type == "session_scheduled"]
        assert all(event.save_notification for event in scheduled)

    def test_ending_without_a_plan_says_nothing_about_the_next_game(
        self, session, repos, mock_event_manager
    ):
        game = start_a_game(session, repos)
        mock_event_manager.broadcast.reset_mock()

        end_a_game(game, repos, EndReason.HOST)

        broadcast = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]
        assert {event.event_type for event in broadcast} == {"session_ended"}

    def test_the_system_take_down_never_plans_the_next_game(
        self, session, repos, session_repo, mock_event_manager
    ):
        """The sweeper closing a forgotten game has nothing to say about when
        the table meets again — and must not clear what the GM said either.

        (The planned NAME is already gone by this point, and rightly: Start
        moved it onto the game that is now being closed.)
        """
        when = datetime.now(timezone.utc) + timedelta(days=3)
        session.schedule(when, "The Siege of Kraghammer")
        session_repo.save(session)
        game = start_a_game(session, repos)
        assert game.name == "The Siege of Kraghammer"

        end_a_game(game, repos, EndReason.SYSTEM, next_scheduled_at=None)

        stored = session_repo.get_by_id(session.id)
        assert stored.scheduled_at is not None
        broadcast = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]
        assert "session_scheduled" not in {event.event_type for event in broadcast}

    def test_ending_leaves_no_open_game_so_the_next_can_start(self, session, repos, game_repo):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST)

        assert game_repo.get_open_game_for_session(session.id) is None

        second = start_a_game(session, repos)
        assert second.id != game.id

    def test_only_the_host_may_end(self, session, repos, player):
        game = start_a_game(session, repos)
        game_repo, session_repo, user_repo, campaign_repo, event_manager = repos
        command = EndGame(
            game_repository=game_repo, session_repository=session_repo,
            user_repository=user_repo, character_repository=None,
            campaign_repository=campaign_repo, event_manager=event_manager,
        )
        with pytest.raises(ValueError, match="Only the host"):
            run(command.execute(game.id, player.id, reason=EndReason.HOST))


class TestTheRoomIsAlwaysCleanedUp:
    """A side effect that fails after ENDED must not strand the hot room.

    Deleting the room is what closes the sockets and sends the players home. It
    used to be scheduled last, after the schedule write and every broadcast, so
    a raise in either left the room hot with its players still in it — and End
    could not be retried, because the game was no longer ACTIVE.
    """

    def _end_with_a_broken_broadcast(self, game, repos):
        game_repo, session_repo, user_repo, campaign_repo, event_manager = repos
        event_manager.broadcast = AsyncMock(side_effect=RuntimeError("events are down"))
        command = EndGame(
            game_repository=game_repo, session_repository=session_repo,
            user_repository=user_repo, character_repository=None,
            campaign_repository=campaign_repo, event_manager=event_manager,
            asset_repository=None,
        )
        scheduled = []

        def capture(coroutine):
            scheduled.append(coroutine)
            coroutine.close()

        with patch("modules.game.application.commands.httpx.AsyncClient", side_effect=ApiGameStub()), \
             patch("modules.game.application.commands.asyncio.create_task", new=capture):
            ended = run(command.execute(game.id, game.host_id, reason=EndReason.HOST))
        return ended, scheduled

    def test_cleanup_is_scheduled_even_when_the_broadcast_raises(self, session, repos):
        game = start_a_game(session, repos)

        ended, scheduled = self._end_with_a_broken_broadcast(game, repos)

        assert len(scheduled) == 1, "the room's deletion was never scheduled"
        assert ended.status == GameStatus.ENDED

    def test_the_caller_is_not_told_the_take_down_failed(self, session, repos, game_repo):
        """The game really did end, so End must not raise and invite a retry."""
        game = start_a_game(session, repos)

        self._end_with_a_broken_broadcast(game, repos)

        assert game_repo.get_by_id(game.id).status == GameStatus.ENDED
        assert game_repo.get_open_game_for_session(session.id) is None


class TestGameHistory:
    def test_ended_games_come_back_newest_first(self, session, repos, game_repo, create_game, campaign):
        older = create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
            status=GameStatus.ENDED, name="Session One",
        )
        newer = create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
            status=GameStatus.ENDED, name="Session Two",
        )
        older.ended_at = datetime.utcnow() - timedelta(days=7)
        newer.ended_at = datetime.utcnow()
        game_repo.save(older)
        game_repo.save(newer)

        history = game_repo.get_ended_games_for_session(session.id)

        assert [game.name for game in history] == ["Session Two", "Session One"]

    def test_an_open_game_is_not_history(self, session, repos, game_repo):
        start_a_game(session, repos)

        assert game_repo.get_ended_games_for_session(session.id) == []

    def _played(self, count, session, campaign, game_repo, create_game):
        """`count` ended games, one a day apart so the ordering is unambiguous."""
        for day in range(count):
            game = create_game(
                session_id=session.id, campaign_id=campaign.id, host_id=session.host_id,
                status=GameStatus.ENDED, name=f"Night {day + 1}",
            )
            game.ended_at = datetime.utcnow() - timedelta(days=count - day)
            game_repo.save(game)

    def test_the_history_can_be_capped(self, session, game_repo, create_game, campaign):
        """Every session response carries this list and a campaign gains a game
        per evening for life, so it must not be able to grow without bound."""
        self._played(9, session, campaign, game_repo, create_game)

        recent = game_repo.get_ended_games_for_session(session.id, limit=5)

        assert [game.name for game in recent] == [
            "Night 9", "Night 8", "Night 7", "Night 6", "Night 5",
        ]

    def test_the_count_is_the_true_total_not_the_capped_slice(
        self, session, game_repo, create_game, campaign
    ):
        """What the drawer numbers its games from. Reading the slice's length
        instead would restart the numbering at the cap."""
        self._played(9, session, campaign, game_repo, create_game)

        assert game_repo.count_ended_games_for_session(session.id) == 9
        assert len(game_repo.get_ended_games_for_session(session.id, limit=5)) == 5

    def test_an_open_game_is_not_counted(self, session, repos, game_repo, create_game, campaign):
        self._played(2, session, campaign, game_repo, create_game)
        # An open game would break the one-open-per-session index if history
        # counted it, and would also number tonight as though it were over.
        assert game_repo.count_ended_games_for_session(session.id) == 2


class TestUpdateGame:
    def test_the_host_can_correct_the_record_afterwards(self, session, repos, game_repo):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST, name="Typo")

        UpdateGame(game_repo).execute(
            game_id=game.id, host_id=session.host_id,
            name="The Siege of Kraghammer", summary="The party fled north.",
        )

        stored = game_repo.get_by_id(game.id)
        assert stored.name == "The Siege of Kraghammer"
        assert stored.summary == "The party fled north."

    def test_omitted_fields_are_left_alone(self, session, repos, game_repo):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST, name="Keep me", summary="And me")

        UpdateGame(game_repo).execute(game_id=game.id, host_id=session.host_id, name=None)

        stored = game_repo.get_by_id(game.id)
        assert stored.name == "Keep me"
        assert stored.summary == "And me"

    def test_an_empty_string_clears(self, session, repos, game_repo):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST, name="Remove me")

        UpdateGame(game_repo).execute(game_id=game.id, host_id=session.host_id, name="")

        assert game_repo.get_by_id(game.id).name is None

    def test_a_player_cannot(self, session, repos, game_repo, player):
        game = start_a_game(session, repos)

        with pytest.raises(ValueError, match="Only the host"):
            UpdateGame(game_repo).execute(game_id=game.id, host_id=player.id, name="Mine now")


class TestDisconnectFromGame:
    """A leaver's disconnect validates and writes NOTHING.

    These are clobber guards. The room's player_metadata carries an HP snapshot
    taken when the character was selected, while the in-game sheet patches HP
    straight to PostgreSQL — so the room's copy is always the older of the two.
    Writing it back on disconnect lost every hit the player had taken. If someone
    reintroduces that write, the first two tests here fail.
    """

    def _character(self, campaign_id, user_id, hp_current=20):
        return MagicMock(
            hp_current=hp_current,
            is_alive=True,
            active_campaign=campaign_id,
            is_owned_by=lambda uid: uid == user_id,
        )

    def test_leaves_the_character_row_untouched(self, session, repos, game_repo, campaign, host):
        game = start_a_game(session, repos)
        character = self._character(campaign.id, host.id, hp_current=7)
        character_repo = MagicMock(get_by_id=lambda _id: character)

        DisconnectFromGame(game_repo, character_repo).execute(
            game_id=game.id, user_id=host.id, character_id=uuid4(),
        )

        # 7 is what the sheet wrote cold during play. The room still believes 20.
        assert character.hp_current == 7
        character_repo.save.assert_not_called()

    def test_does_not_kill_a_character_the_room_thinks_is_down(
        self, session, repos, game_repo, campaign, host
    ):
        """A stale zero in the room must not mark a healed character dead."""
        game = start_a_game(session, repos)
        character = self._character(campaign.id, host.id, hp_current=12)
        character_repo = MagicMock(get_by_id=lambda _id: character)

        DisconnectFromGame(game_repo, character_repo).execute(
            game_id=game.id, user_id=host.id, character_id=uuid4(),
        )

        character.mark_dead.assert_not_called()

    def test_refused_when_no_game_is_running(self, session, repos, game_repo, campaign, host):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST)
        character_repo = MagicMock(get_by_id=lambda _id: self._character(campaign.id, host.id))

        with pytest.raises(ValueError, match="No game is running"):
            DisconnectFromGame(game_repo, character_repo).execute(
                game_id=game.id, user_id=host.id, character_id=uuid4(),
            )

    def test_refused_for_a_character_the_user_does_not_own(
        self, session, repos, game_repo, campaign, host, player
    ):
        game = start_a_game(session, repos)
        character_repo = MagicMock(get_by_id=lambda _id: self._character(campaign.id, host.id))

        with pytest.raises(ValueError, match="not owned by user"):
            DisconnectFromGame(game_repo, character_repo).execute(
                game_id=game.id, user_id=player.id, character_id=uuid4(),
            )

    def test_refused_for_a_character_locked_to_another_campaign(
        self, session, repos, game_repo, host
    ):
        game = start_a_game(session, repos)
        character_repo = MagicMock(get_by_id=lambda _id: self._character(uuid4(), host.id))

        with pytest.raises(ValueError, match="not locked to this campaign"):
            DisconnectFromGame(game_repo, character_repo).execute(
                game_id=game.id, user_id=host.id, character_id=uuid4(),
            )


class TestNoPlayStateOnTheWire:
    def test_the_response_shape_carries_none_of_it(self):
        """The eight state fields exist for the next Start to read, server-side.
        Shipping them would put a whole session's history in every page load.
        """
        state_fields = {
            "map_token_seed", "map_token_state", "adventure_log", "map_config",
            "image_config", "active_display", "audio_config", "spotify_config",
        }

        assert state_fields.isdisjoint(GameResponse.model_fields)

    def test_a_serialised_game_leaks_nothing(self, session, repos, game_repo):
        game = start_a_game(session, repos)
        end_a_game(game, repos, EndReason.HOST)

        payload = json.loads(GameResponse.model_validate(game_repo.get_by_id(game.id)).model_dump_json())

        for state_field in ("map_token_state", "adventure_log", "audio_config"):
            assert state_field not in payload
