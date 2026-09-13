# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The character half of the game ETL.

Start sends every config version in the party, keyed by id, so two players built against
different versions both resolve in the room — a GM's edit never forces anyone to rebuild.
End brings the values home, because api-game owns them while the game is open.
"""

import pytest
from shared_contracts.components.hit_points import HitPointsValue, IntHitPointsState
from shared_contracts.components.name import NameValue
from shared_contracts.session import PlayerState

from modules.characters.application.commands import WriteCharacterValuesFromGame


@pytest.fixture
def host(create_user):
    return create_user(email="gm@example.com", screen_name="Matt")


@pytest.fixture
def player(create_user):
    return create_user(email="player@example.com", screen_name="Bran")


@pytest.fixture
def campaign(create_campaign, host, seed_default_edition):
    return create_campaign(host_id=host.id, title="Secret to Bear")


@pytest.fixture
def session(create_session, session_repo, campaign, host, player):
    session = create_session(campaign_id=campaign.id, host_id=host.id)
    session.joined_users.extend([host.id, player.id])
    session_repo.save(session)
    return session_repo.get_by_id(session.id)


class TestEndWritesValuesCold:
    def test_values_and_colour_come_home(self, character_repo, create_character, player, campaign, session):
        character = create_character(user_id=player.id, name="Brannoc Vell",
                                     campaign_id=campaign.id, session_id=session.id)

        WriteCharacterValuesFromGame(character_repo).execute(
            character_id=character.id,
            values={
                "name_1": NameValue(component_id="name_1", text="Brannoc Vell"),
                "hit_points_1": HitPointsValue(component_id="hit_points_1",
                                               state=IntHitPointsState(current=0)),
            },
            color="#3b82f6",
        )

        reloaded = character_repo.get_by_id(character.id)
        assert reloaded.values["hit_points_1"].state.current == 0
        assert reloaded.color == "#3b82f6"
        # Reaching the zero point is rendered, never acted on.
        assert reloaded.is_alive is True

    def test_a_corrupt_document_costs_only_that_player(
            self, character_repo, create_character, player, campaign, session):
        """One bad value must not abort the write for the rest of the table, and must not
        wipe what is already cold."""
        character = create_character(user_id=player.id, name="Brannoc Vell",
                                     campaign_id=campaign.id, session_id=session.id)

        WriteCharacterValuesFromGame(character_repo).execute(
            character_id=character.id,
            values={"attribute_9": NameValue(component_id="attribute_9", text="not a thing")},
            color="#ff0000",
        )

        reloaded = character_repo.get_by_id(character.id)
        assert reloaded.values["attribute_1"].score == 10   # untouched
        assert reloaded.color == "#ff0000"                   # colour still applied

    def test_an_unknown_character_is_logged_not_raised(self, character_repo):
        import uuid
        WriteCharacterValuesFromGame(character_repo).execute(
            character_id=uuid.uuid4(), values={}, color=None)

    def test_player_state_with_no_character_carries_nothing(self):
        state = PlayerState(user_id="u1", player_name="bran")
        assert state.values == {}
        assert state.config_version_id is None


class TestStartSendsConfigs:
    def test_two_versions_in_one_party_both_travel(
            self, character_repo, create_character, campaign, session, host, player,
            make_character_config, make_character_values):
        """Different config versions at one table is the normal case after a GM edit."""
        create_character(user_id=player.id, name="On v1", campaign_id=campaign.id,
                         session_id=session.id, config=make_character_config(version=1))
        create_character(user_id=host.id, name="On v2", campaign_id=campaign.id,
                         session_id=session.id, config=make_character_config(version=2, hp_maximum=25))

        party = character_repo.get_party_for_session(session.id)
        versions = {character.config_snapshot.version for character in party}
        assert versions == {1, 2}

    def test_the_party_is_what_start_reads(
            self, character_repo, create_character, campaign, session, player):
        """Start builds from the party, so an unbound character must not appear in it."""
        create_character(user_id=player.id, name="At the table",
                         campaign_id=campaign.id, session_id=session.id, slot=0)
        create_character(user_id=player.id, name="Keepsake", slot=1)

        party = character_repo.get_party_for_session(session.id)
        assert [character.display_name for character in party] == ["At the table"]
