# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The campaign's one session: created once, never replaced.

A session is born with its campaign and lives as long as the campaign does.
There is no create route, no reset and no delete — the only thing that ever
happens to it is that games are played at it, and those are their own aggregate
(modules/game).

What this file pins is creation: once per campaign, host only, and the guard
firing BEFORE a row is written. Why the session must outlive its games is pinned
in modules/game/tests/test_game_lifecycle.py, at the merge that proves it.
"""

import asyncio

import pytest

from modules.campaign.domain.campaign_role import CampaignRole
from modules.session.application.commands import CreateSession


@pytest.fixture
def host(create_user):
    return create_user(email="dm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Alice")


@pytest.fixture
def campaign_with_session(campaign_repo, session_repo, mock_event_manager, host, player, seed_default_edition):
    """A campaign and a second member on the roster.

    Every test gets its own campaign and users; the session is created inside
    each test through the real command, so the roster is filled the way
    production fills it.
    """
    from modules.campaign.domain.campaign_aggregate import CampaignAggregate

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

        assert set(session.joined_users) == {host.id, player.id}

    def test_carries_no_status_and_no_play_state(
        self, campaign_with_session, campaign_repo, session_repo, mock_event_manager
    ):
        """The session is who and when. Boards, logs and liveness belong to games.

        Asserted as absence rather than value so the day someone reintroduces a
        status column, this fails rather than quietly agreeing with it.
        """
        session = create_the_session(
            campaign_with_session, campaign_repo, session_repo, mock_event_manager
        )

        for game_shaped in (
            "status", "started_at", "stopped_at", "urls_expire_at",
            "map_token_state", "map_token_seed", "adventure_log",
            "map_config", "image_config", "active_display",
            "audio_config", "spotify_config",
        ):
            assert not hasattr(session, game_shaped), f"{game_shaped} is the game's, not the session's"

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
