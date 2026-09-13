# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character persistence, and the database fact that one character per user per party is.

The partial unique index is the rule — not application code — so these tests go through the
database rather than around it.
"""

import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from modules.characters.domain.character_aggregate import CharacterAggregate


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
def session(create_session, campaign, host):
    return create_session(campaign_id=campaign.id, host_id=host.id)


class TestRoundTrip:
    def test_snapshot_and_values_survive_the_json_columns(
            self, character_repo, create_character, player, campaign, session):
        character = create_character(
            user_id=player.id, name="Brannoc Vell",
            campaign_id=campaign.id, session_id=session.id)

        reloaded = character_repo.get_by_id(character.id)
        assert reloaded.display_name == "Brannoc Vell"
        assert reloaded.config_snapshot.components[1].rules.maximum == 20
        assert reloaded.values["attribute_1"].score == 10
        # The union resolved on the way back out, not a raw dict.
        assert reloaded.values["hit_points_1"].state.current == 10

    def test_get_by_ids_returns_a_map(self, character_repo, create_character, player):
        first = create_character(user_id=player.id, name="One", slot=0)
        second = create_character(user_id=player.id, name="Two", slot=1)
        found = character_repo.get_by_ids([first.id, second.id, uuid.uuid4()])
        assert set(found) == {first.id, second.id}

    def test_get_by_ids_with_nothing_asks_nothing(self, character_repo):
        assert character_repo.get_by_ids([]) == {}


class TestPartyReads:
    def test_party_is_every_character_bound_to_the_session(
            self, character_repo, create_character, player, host, campaign, session):
        mine = create_character(user_id=player.id, name="Brannoc", campaign_id=campaign.id, session_id=session.id)
        theirs = create_character(user_id=host.id, name="Vell", campaign_id=campaign.id, session_id=session.id)
        create_character(user_id=player.id, name="Keepsake", slot=1)  # unbound

        party = character_repo.get_party_for_session(session.id)
        assert {character.id for character in party} == {mine.id, theirs.id}

    def test_party_excludes_deleted(self, character_repo, create_character, player, campaign, session):
        character = create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id)
        character.soft_delete()
        character_repo.save(character)
        assert character_repo.get_party_for_session(session.id) == []

    def test_get_party_character_finds_that_users_one(
            self, character_repo, create_character, player, campaign, session):
        character = create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id)
        assert character_repo.get_party_character(session.id, player.id).id == character.id

    def test_get_party_character_is_none_for_a_user_with_none(
            self, character_repo, player, session):
        assert character_repo.get_party_character(session.id, player.id) is None


class TestOneCharacterPerParty:
    def test_a_second_character_at_the_same_table_is_refused(
            self, db_session, character_repo, create_character, player, campaign, session,
            make_character_config, make_character_values):
        create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id, slot=0)

        second = CharacterAggregate.create(
            user_id=player.id, campaign_id=campaign.id, session_id=session.id,
            config_version_id=None, config=make_character_config(),
            values=make_character_values(name="Interloper"), slot=1)
        with pytest.raises(IntegrityError):
            character_repo.save(second)
        db_session.rollback()

    def test_aliveness_does_not_free_the_slot(
            self, db_session, character_repo, create_character, player, campaign, session,
            make_character_config, make_character_values):
        """A dead character keeps its place until someone ejects it — so the index must not
        be qualified by is_alive, or a user could hold a dead one and a living one."""
        first = create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id, slot=0)
        first.set_alive(False)
        character_repo.save(first)

        second = CharacterAggregate.create(
            user_id=player.id, campaign_id=campaign.id, session_id=session.id,
            config_version_id=None, config=make_character_config(),
            values=make_character_values(name="Replacement"), slot=1)
        with pytest.raises(IntegrityError):
            character_repo.save(second)
        db_session.rollback()

    def test_ejecting_frees_the_slot(
            self, character_repo, create_character, player, campaign, session):
        first = create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id, slot=0)
        first.unbind_from_table()
        character_repo.save(first)

        second = create_character(
            user_id=player.id, name="Replacement",
            campaign_id=campaign.id, session_id=session.id, slot=1)
        assert character_repo.get_party_character(session.id, player.id).id == second.id

    def test_two_users_may_each_hold_one(
            self, character_repo, create_character, player, host, campaign, session):
        create_character(user_id=player.id, campaign_id=campaign.id, session_id=session.id)
        create_character(user_id=host.id, campaign_id=campaign.id, session_id=session.id)
        assert len(character_repo.get_party_for_session(session.id)) == 2
