# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""DELETE /api/campaigns/{id} — a running game is a step on the way, not a refusal.

Deleting a campaign is the GM's call. If a game is running at its table the
endpoint ends it first — the real EndGame with EndReason.SYSTEM, so the ETL
lands what outlives the campaign (asset settings, character colours) and the
room close sends everyone home — and only then deletes the campaign. The
command's own "End the game before deleting" guard stays as the backstop and
is what a game that cannot be ended (STARTING, ENDING) still meets.

api-game's HTTP is stubbed with the harness the game suite uses. The SQLite test
database does not enforce foreign keys, so the games rows' ON DELETE CASCADE is
not observable here; that cascade is the database's (declared in the migration
and the model), not this endpoint's, and these tests assert the end instead.
"""

import asyncio
from unittest.mock import patch

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.events.dependencies.providers import get_event_manager
from modules.game.domain.game_aggregate import GameStatus
from modules.game.tests.test_game_lifecycle import ApiGameStub, start_a_game
from modules.session.domain.session_aggregate import SessionEntity


@pytest.fixture
def host(create_user):
    return create_user(email="dm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Alice")


@pytest.fixture
def campaign(campaign_repo, host, player, seed_default_edition):
    aggregate = CampaignAggregate.create(
        title="Curse of Strahd", description="Gothic horror", created_by=host.id
    )
    aggregate.members[player.id] = CampaignRole.PLAYER
    campaign_repo.save(aggregate)
    return aggregate


@pytest.fixture
def session(campaign, campaign_repo, session_repo):
    entity = SessionEntity.create(campaign_id=campaign.id, host_id=campaign.created_by)
    session_repo.save(entity)
    campaign.add_session(entity.id)
    campaign_repo.save(campaign)
    return entity


@pytest.fixture
def repos(game_repo, session_repo, user_repo, campaign_repo, mock_event_manager):
    return (game_repo, session_repo, user_repo, campaign_repo, mock_event_manager)


@pytest.fixture
def events_from(client, mock_event_manager):
    """Route the endpoint's broadcasts through the test's mock."""
    from main import app

    app.dependency_overrides[get_event_manager] = lambda: mock_event_manager
    return mock_event_manager


def delete_campaign(client, campaign_id, api_game):
    """DELETE with api-game stubbed.

    The room delete is a background task the request does not wait for, so it
    is captured, then driven to completion here — still inside the api-game
    patch, so the stub sees the delete. The returned list holds every coroutine
    EndGame scheduled; a test that expects no end asserts it is empty.
    """
    scheduled = []

    def capture(coroutine):
        scheduled.append(coroutine)

    with patch("modules.game.application.commands.httpx.AsyncClient", side_effect=api_game), \
         patch("modules.game.application.commands.asyncio.create_task", new=capture):
        response = client.delete(f"/api/campaigns/{campaign_id}")
        for coroutine in scheduled:
            asyncio.run(coroutine)
    return response, scheduled


class TestDeleteEndsTheGameFirst:
    def test_a_live_game_is_ended_then_the_campaign_goes(
        self, client, auth_as, events_from, campaign, session, repos, campaign_repo, game_repo, host
    ):
        game = start_a_game(session, repos)
        assert game.status is GameStatus.ACTIVE
        events_from.broadcast.reset_mock()
        api_game = ApiGameStub()
        auth_as(host.id)

        response, scheduled = delete_campaign(client, campaign.id, api_game)

        assert response.status_code == 200, response.text
        assert campaign_repo.get_by_id(campaign.id) is None
        # The take-down ETL ran for that game before the delete …
        assert api_game.end_game_ids == [str(game.id)]
        assert game_repo.get_open_game_for_campaign(campaign.id) is None
        # … and the room delete was scheduled and, once driven, reached the
        # stub. That close is what evicts the players, so it is part of the
        # flow and not left to the end-game suite alone.
        assert len(scheduled) == 1
        assert api_game.deleted_room_ids == [str(game.id)]
        # Silently: the system reason says nothing about a game ending, and
        # campaign_deleted itself is a cache invalidation, not a toast — the
        # room close is the only thing a player sees.
        broadcast = [call.args[0] for call in events_from.broadcast.call_args_list]
        assert {event.event_type for event in broadcast} == {"session_paused", "campaign_deleted"}

    def test_a_game_that_cannot_be_ended_still_refuses(
        self, client, auth_as, events_from, campaign, session, repos, campaign_repo, game_repo, create_game, host
    ):
        """Regression guard, not a proof of the new flow: this passes on the code
        before the change too, because the command's guard refused every open
        game. It pins that the guard survives for the games EndGame cannot
        close — STARTING here — so a delete never cascades under an open room.
        """
        game = create_game(
            session_id=session.id, campaign_id=campaign.id, host_id=host.id,
            status=GameStatus.STARTING,
        )
        auth_as(host.id)

        response, scheduled = delete_campaign(client, campaign.id, ApiGameStub())

        assert response.status_code == 400
        assert campaign_repo.get_by_id(campaign.id) is not None
        assert game_repo.get_by_id(game.id).status is GameStatus.STARTING
        assert events_from.broadcast.call_count == 0
        assert scheduled == []

    def test_a_player_cannot_end_a_game_by_asking_for_a_delete(
        self, client, auth_as, events_from, campaign, session, repos, campaign_repo, game_repo, player
    ):
        """The end acts as the caller. A member who may not delete the campaign
        must not be able to take its live game down as a side effect."""
        game = start_a_game(session, repos)
        events_from.broadcast.reset_mock()
        auth_as(player.id)

        response, scheduled = delete_campaign(client, campaign.id, ApiGameStub())

        assert response.status_code == 400
        assert campaign_repo.get_by_id(campaign.id) is not None
        assert game_repo.get_by_id(game.id).status is GameStatus.ACTIVE
        assert events_from.broadcast.call_count == 0
        assert scheduled == []
