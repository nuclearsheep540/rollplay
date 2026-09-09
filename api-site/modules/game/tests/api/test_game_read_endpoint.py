# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""GET /api/games/{id} — the one read the game runtime needs.

The dashboard gets its games with the campaigns it already fetches
(SessionResponse.game/.games). The runtime has neither: it knows a room id,
which IS a game id. This route is how it reads the game it is in — and the
reason it exists at all is the End dialog, which prefills the night's name from
whatever the GM planned in the schedule form before starting.
"""

from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.campaign.domain.campaign_role import CampaignRole
from modules.game.domain.game_aggregate import GameStatus
from modules.session.domain.session_aggregate import SessionEntity


@pytest.fixture
def host(create_user):
    return create_user(email="dm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Alice")


@pytest.fixture
def outsider(create_user):
    return create_user(email="nobody@example.com", screen_name="Nobody")


@pytest.fixture
def game(campaign_repo, session_repo, create_game, host, player):
    campaign = CampaignAggregate.create(
        title="Curse of Strahd", description="Gothic horror", created_by=host.id
    )
    campaign.members[player.id] = CampaignRole.PLAYER
    campaign_repo.save(campaign)

    session = SessionEntity.create(campaign_id=campaign.id, host_id=host.id)
    session_repo.save(session)

    return create_game(
        session_id=session.id,
        campaign_id=campaign.id,
        host_id=host.id,
        status=GameStatus.ACTIVE,
        name="The Siege of Kraghammer",
    )


class TestGetGame:
    def test_the_host_reads_the_name_the_dialog_prefills_with(self, client, auth_as, game, host):
        auth_as(host.id)

        response = client.get(f"/api/games/{game.id}")

        assert response.status_code == 200
        assert response.json()["name"] == "The Siege of Kraghammer"

    def test_it_names_the_campaign_for_a_surface_that_has_no_other_way_to_know(
        self, client, auth_as, game, host
    ):
        """The game runtime holds a room id and nothing else, so its wrap-up
        would otherwise say "this campaign" to a GM whose campaign has a name."""
        auth_as(host.id)

        assert client.get(f"/api/games/{game.id}").json()["campaign_name"] == "Curse of Strahd"

    def test_a_player_may_read_it_too(self, client, auth_as, game, player):
        """Anyone at the table can be in the runtime, so anyone at the table can read."""
        auth_as(player.id)

        assert client.get(f"/api/games/{game.id}").status_code == 200

    def test_someone_outside_the_campaign_cannot(self, client, auth_as, game, outsider):
        auth_as(outsider.id)

        assert client.get(f"/api/games/{game.id}").status_code == 403

    def test_a_missing_game_is_a_404(self, client, auth_as, host):
        auth_as(host.id)

        assert client.get(f"/api/games/{uuid4()}").status_code == 404

    def test_it_carries_no_play_state(self, client, auth_as, game, host):
        auth_as(host.id)

        payload = client.get(f"/api/games/{game.id}").json()

        for state_field in ("map_token_state", "adventure_log", "audio_config", "map_token_seed"):
            assert state_field not in payload
