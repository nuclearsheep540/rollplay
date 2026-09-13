# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""While a seated character's table has an open game, the room owns the character: cold
writes to it are refused. Values already were; alive and avatar had slipped through."""

import pytest

from modules.characters.application.commands import SetCharacterAlive, SetCharacterAvatar


@pytest.fixture
def host(create_user):
    return create_user(email="gm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Bran")


@pytest.fixture
def table(create_campaign, create_session, session_repo, host, player, seed_default_edition):
    campaign = create_campaign(host_id=host.id, title="Secret to Bear")
    session = create_session(campaign_id=campaign.id, host_id=host.id)
    session.joined_users.extend([host.id, player.id])
    session_repo.save(session)
    return campaign, session_repo.get_by_id(session.id)


@pytest.fixture
def seated(table, player, create_character):
    campaign, session = table
    return create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id)


class TestGameRunningGuard:
    def test_alive_is_refused_while_a_game_runs(self, character_repo, campaign_repo, game_repo, create_game, table, host, player, seated):
        campaign, session = table
        create_game(session_id=session.id, campaign_id=campaign.id, host_id=host.id)
        with pytest.raises(ValueError, match="A game is running"):
            SetCharacterAlive(character_repo, campaign_repo, game_repo).execute(
                character_id=seated.id, requesting_user_id=player.id, is_alive=False)

    def test_alive_is_allowed_on_a_quiet_table(self, character_repo, campaign_repo, game_repo, player, seated):
        updated = SetCharacterAlive(character_repo, campaign_repo, game_repo).execute(
            character_id=seated.id, requesting_user_id=player.id, is_alive=False)
        assert updated.is_alive is False

    def test_avatar_is_refused_while_a_game_runs(self, character_repo, game_repo, create_game, table, host, player, seated):
        campaign, session = table
        create_game(session_id=session.id, campaign_id=campaign.id, host_id=host.id)
        with pytest.raises(ValueError, match="A game is running"):
            SetCharacterAvatar(character_repo, None, game_repo).execute(
                character_id=seated.id, user_id=player.id, asset_id=None)

    def test_a_keepsake_is_never_held_by_a_game(self, character_repo, campaign_repo, game_repo, player, create_character):
        keepsake = create_character(user_id=player.id)
        updated = SetCharacterAlive(character_repo, campaign_repo, game_repo).execute(
            character_id=keepsake.id, requesting_user_id=player.id, is_alive=False)
        assert updated.is_alive is False
