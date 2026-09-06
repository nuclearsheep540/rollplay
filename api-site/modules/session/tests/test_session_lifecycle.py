# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Lifecycle rules for the campaign's one session: it is created once and never replaced.

The user-facing model is two verbs — Start game and End game — over a session
that outlives every game played through it. There is no reset (removed
2026-09-06, ahead of the Game aggregate in plans/home/07): a session is born
with its campaign and lives as long as the campaign does. These tests pin:

- creation is once per campaign, and only the host may do it;
- WHY ending keeps the session, at the merge that runs on every start: pc
  tokens exist only on the previous board, so a fresh row cannot bring
  players' pieces back. That asymmetry is the whole reason End game keeps the
  session instead of retiring it.
"""

import asyncio
from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_role import CampaignRole
from modules.session.application.commands import CreateSession
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


class TestWhyEndingKeepsTheSession:
    """The merge behaviour that makes a replacement row destructive.

    Every start merges (seed, previous board, current npc baseline). npc tokens
    come back from the workshop baseline whatever happens; pc tokens exist ONLY
    on the previous board. So the same session start restores players' pieces,
    and a fresh row cannot — which is why End game keeps the session and nothing
    replaces it.
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
