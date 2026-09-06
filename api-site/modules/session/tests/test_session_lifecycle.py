# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Lifecycle rules for the campaign's one session: create, reset, and delete.

The user-facing model is two verbs — Start game and End game — over a session
that outlives every game played through it. Reset is the third, deliberate act
that throws play state away. These tests pin the rules that make that safe:

- creation is once per campaign;
- reset really does replace the row (new id, empty boards) AND clears the
  table — every non-DM member removed, their characters released, pending
  invites cancelled — because its purpose is a fresh run with new players;
- deletion is refused while a game is running, so a reset cannot strand a live
  game's hot state in api-game with nothing cold pointing at it.

The last class characterises WHY end and reset differ, at the merge that runs on
every start: pc tokens exist only on the previous board, so a fresh row cannot
bring players' pieces back. That asymmetry is the whole reason End game keeps the
session instead of retiring it.
"""

import asyncio
from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_role import CampaignRole
from modules.session.application.commands import CreateSession, ResetSession
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus
from modules.session.domain.token_merge import merge_token_boards


@pytest.fixture
def host(create_user):
    return create_user(email="dm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Alice")


@pytest.fixture
def campaign_with_session(campaign_repo, session_repo, mock_event_manager, host, player, seed_default_edition):
    """A campaign, its one session, and a second member on the roster.

    Built through the real command so the roster is filled the way production
    fills it, and every test gets its own campaign, session and users.
    """
    from modules.campaign.domain.campaign_aggregate import CampaignAggregate
    from modules.campaign.domain.campaign_role import CampaignRole

    campaign = CampaignAggregate.create(
        title="Curse of Strahd",
        description="Gothic horror",
        created_by=host.id,
    )
    campaign.members[player.id] = CampaignRole.PLAYER
    campaign_repo.save(campaign)
    return campaign


def run(coroutine):
    """Drive an async command from a sync test.

    The repo has no async test plugin and this change is not the place to add a
    dependency — these commands hold no loop-bound state (the repositories are
    synchronous SQLAlchemy), so a fresh loop per call is faithful.
    """
    return asyncio.run(coroutine)


def reset_command(session_repo, campaign_repo, user_repo, character_repo, event_manager):
    return ResetSession(session_repo, campaign_repo, user_repo, character_repo, event_manager)


def create_the_session(campaign, campaign_repo, session_repo, event_manager):
    return run(CreateSession(session_repo, campaign_repo, event_manager).execute(
        campaign_id=campaign.id,
        host_id=campaign.created_by,
    ))


class TestCreateSession:
    def test_enrols_every_campaign_member(
        self, campaign_with_session, campaign_repo, session_repo, mock_event_manager, host, player
    ):
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )

        assert session.status == SessionStatus.INACTIVE
        assert set(session.joined_users) == {host.id, player.id}

    def test_refuses_a_second_session_without_writing_a_row(
        self, campaign_with_session, campaign_repo, session_repo, mock_event_manager
    ):
        """The refusal has to come BEFORE the insert.

        The command saves the session and only then attaches it to the campaign,
        so a guard living only in CampaignAggregate.add_session would raise after
        the row was already committed — leaving the orphan second session the
        invariant exists to prevent.
        """
        create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )

        with pytest.raises(ValueError, match="already has a session"):
            create_the_session(
                campaign_with_session, campaign_repo, session_repo, mock_event_manager
            )

        assert len(session_repo.get_by_campaign_id(campaign_with_session.id)) == 1

    def test_only_the_host_may_create(
        self, campaign_with_session, campaign_repo, session_repo, mock_event_manager, player
    ):
        with pytest.raises(ValueError, match="Only campaign host"):
            run(CreateSession(session_repo, campaign_repo, mock_event_manager).execute(
                campaign_id=campaign_with_session.id,
                host_id=player.id,
            ))


class TestResetSession:
    def test_replaces_the_row_and_wipes_play_state(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo, mock_event_manager, host
    ):
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )
        board_id = str(uuid4())
        session.map_token_state = {board_id: [{"id": str(uuid4()), "kind": "pc"}]}
        session.map_token_seed = {board_id: []}
        session.adventure_log = [{"message": "Alice rolled a 20", "log_id": 1}]
        session.active_display = "map"
        session_repo.save(session)

        replacement = run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id
        ))

        assert replacement.id != session.id
        assert session_repo.get_by_id(session.id) is None
        assert not replacement.map_token_state
        assert not replacement.adventure_log
        assert replacement.active_display is None
        assert replacement.status == SessionStatus.INACTIVE

    def test_clears_the_table(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo,
        mock_event_manager, host, player, create_user, create_character
    ):
        """A reset is a fresh run for new players: everyone but the DM leaves, their
        characters are released, and pending invites are cancelled. The campaign
        itself — assets, notes, authored NPCs — is untouched."""
        invitee = create_user(email="invited@example.com", screen_name="Bob")
        campaign_with_session.members[invitee.id] = CampaignRole.INVITED
        campaign_repo.save(campaign_with_session)
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )
        character = create_character(user_id=player.id, name="Aelwyn")
        character.lock_to_campaign(campaign_with_session.id)
        character_repo.save(character)

        replacement = run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id
        ))

        cleared = campaign_repo.get_by_id(campaign_with_session.id)
        assert cleared.members == {host.id: CampaignRole.DM}
        assert replacement.joined_users == [host.id]
        assert character_repo.get_by_id(character.id).active_campaign is None

    def test_tells_everyone_it_removed(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo,
        mock_event_manager, host, player, create_user
    ):
        """Removal rides the existing remove-player and cancel-invite events, so each
        person learns the table is gone the same way they would if removed by hand."""
        invitee = create_user(email="invited@example.com", screen_name="Bob")
        campaign_with_session.members[invitee.id] = CampaignRole.INVITED
        campaign_repo.save(campaign_with_session)
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )
        mock_event_manager.broadcast.reset_mock()

        run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id
        ))

        sent = [call.args[0] for call in mock_event_manager.broadcast.call_args_list]
        by_recipient = {(event.user_id, event.event_type) for event in sent}
        assert (player.id, "campaign_player_removed") in by_recipient
        assert (invitee.id, "campaign_invite_canceled") in by_recipient

    def test_leaves_the_campaign_holding_exactly_one_session(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo, mock_event_manager, host
    ):
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )

        replacement = run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
            session_id=session.id, host_id=host.id
        ))

        remaining = session_repo.get_by_campaign_id(campaign_with_session.id)
        assert [entity.id for entity in remaining] == [replacement.id]

    def test_refused_while_a_game_is_running(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo, mock_event_manager, host, player
    ):
        """Hot state lives in api-game keyed by this id — deleting the cold row
        under a live game would leave it unreachable."""
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )
        session.start()
        session.activate()
        session_repo.save(session)

        with pytest.raises(ValueError, match="End the game before resetting"):
            run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
                session_id=session.id, host_id=host.id
            ))

        # Refused before anything moved: the row AND the party are untouched.
        assert session_repo.get_by_id(session.id) is not None
        assert player.id in campaign_repo.get_by_id(campaign_with_session.id).members

    def test_only_the_host_may_reset(
        self, campaign_with_session, campaign_repo, session_repo, user_repo, character_repo, mock_event_manager, player
    ):
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )

        with pytest.raises(ValueError, match="Only the host"):
            run(reset_command(session_repo, campaign_repo, user_repo, character_repo, mock_event_manager).execute(
                session_id=session.id, host_id=player.id
            ))

        assert session_repo.get_by_id(session.id) is not None


class TestSessionDeletionGuard:
    @pytest.mark.parametrize(
        "status", [SessionStatus.STARTING, SessionStatus.ACTIVE, SessionStatus.STOPPING]
    )
    def test_only_an_idle_session_may_be_deleted(self, status):
        session = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())
        session.status = status

        assert session.can_delete() is False

    def test_an_idle_session_may_be_deleted(self):
        session = SessionEntity.create(campaign_id=uuid4(), host_id=uuid4())

        assert session.can_delete() is True


class TestWhyEndingKeepsTheSession:
    """The merge behaviour that makes a replacement row destructive.

    Every start merges (seed, previous board, current npc baseline). npc tokens
    come back from the workshop baseline whatever happens; pc tokens exist ONLY
    on the previous board. So the same session start restores players' pieces,
    and a fresh row cannot — which is why End game keeps the session and only a
    deliberate reset replaces it.
    """

    @staticmethod
    def _pc(owner):
        return {
            "id": str(uuid4()), "kind": "pc", "owner_user_id": str(owner),
            "character_id": None, "label": "Aelwyn", "x": 120.0, "y": 240.0,
            "footprint": 1, "created_by": "alice", "updated_at": None,
            "hidden": False, "locked": False,
        }

    @staticmethod
    def _npc():
        return {
            "id": str(uuid4()), "kind": "npc", "owner_user_id": None,
            "character_id": None, "label": "Pit Trap", "x": 350.0, "y": 650.0,
            "footprint": 1, "created_by": "dm", "updated_at": None,
            "hidden": True, "locked": False,
        }

    def test_the_same_session_brings_player_pieces_back(self):
        baseline = [self._npc()]
        played_board = [self._pc(uuid4())] + [dict(token) for token in baseline]

        merged = merge_token_boards(seed_tokens=baseline, board_tokens=played_board, baseline_tokens=baseline)

        assert [token["kind"] for token in merged].count("pc") == 1

    def test_a_fresh_row_strands_them_while_npcs_reseed(self):
        """The bug the one-session model removes: a new row has no board, so the
        players' pieces have nothing to come back from."""
        baseline = [self._npc()]

        merged = merge_token_boards(seed_tokens=[], board_tokens=[], baseline_tokens=baseline)

        assert [token["kind"] for token in merged] == ["npc"]
        assert not any(token["kind"] == "pc" for token in merged)
