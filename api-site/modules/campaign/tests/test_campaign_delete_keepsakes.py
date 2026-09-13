# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Deleting a campaign leaves keepsakes, not corpses.

The database produces this, not application code: ON DELETE SET NULL on the character's
campaign_id and session_id. The command deliberately does nothing here — a second
implementation of one rule is how the two drift apart.
"""

import asyncio

import pytest

from modules.campaign.application.commands import DeleteCampaign


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


class TestCampaignDeletionLeavesKeepsakes:
    def test_the_character_survives_with_nothing_to_point_at(
            self, db_session, campaign_repo, character_repo, create_character,
            campaign, session, player, mock_event_manager):
        character = create_character(
            user_id=player.id, name="Brannoc Vell",
            campaign_id=campaign.id, session_id=session.id)

        asyncio.run(DeleteCampaign(campaign_repo, None, mock_event_manager).execute(
            campaign_id=campaign.id, host_id=campaign.created_by))
        db_session.expire_all()

        keepsake = character_repo.get_by_id(character.id)
        assert keepsake is not None
        assert keepsake.is_keepsake is True
        assert (keepsake.session_id, keepsake.campaign_id) == (None, None)
        # The snapshot is what lets it still render — no join survives the delete.
        assert keepsake.display_name == "Brannoc Vell"
        assert len(keepsake.config_snapshot.components) == 3
        assert keepsake.values["attribute_1"].score == 10

    def test_the_owner_still_sees_it(
            self, db_session, campaign_repo, character_repo, create_character,
            campaign, session, player, mock_event_manager):
        create_character(user_id=player.id, name="Brannoc Vell",
                         campaign_id=campaign.id, session_id=session.id)

        asyncio.run(DeleteCampaign(campaign_repo, None, mock_event_manager).execute(
            campaign_id=campaign.id, host_id=campaign.created_by))
        db_session.expire_all()

        assert [character.display_name for character in character_repo.get_by_user_id(player.id)] == ["Brannoc Vell"]
