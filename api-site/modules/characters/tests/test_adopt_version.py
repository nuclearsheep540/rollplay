# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Updating a character to the campaign's latest config version: the preview the player
reviews, and the confirmation that applies it. Owner-initiated, never automatic."""

import uuid

import pytest
from shared_contracts.character_config import CharacterConfig
from shared_contracts.components.attribute import AttributeConfiguration, AttributeValue
from shared_contracts.components.identity import IdentityConfiguration, IdentityValue, TextIdentityAnswer, TextIdentityInput

from modules.campaign.application.commands import PublishCharacterConfigVersion, SaveCharacterConfigDraft
from modules.campaign.repositories.character_config_version_repository import CharacterConfigVersionRepository
from modules.characters.application.commands import AdoptConfigVersion
from modules.characters.application.queries import GetCharacterUpgradePreview


@pytest.fixture
def version_repo(db_session):
    return CharacterConfigVersionRepository(db_session)


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


def publish(campaign_repo, version_repo, campaign, host, config):
    SaveCharacterConfigDraft(campaign_repo, version_repo).execute(campaign_id=campaign.id, host_id=host.id, config=config)
    return PublishCharacterConfigVersion(campaign_repo, version_repo).execute(campaign_id=campaign.id, host_id=host.id)


@pytest.fixture
def built_on_v1(campaign_repo, version_repo, campaign, session, host, player, create_character, make_character_config):
    v1 = publish(campaign_repo, version_repo, campaign, host, make_character_config())
    return create_character(
        user_id=player.id, campaign_id=campaign.id, session_id=session.id,
        config_version_id=v1.id, config=v1.config, name="Brannoc",
    )


def v2_config(make_character_config):
    """v2: Wits added, Strength's bound lowered under the character's 10."""
    base = make_character_config(version=2)
    return CharacterConfig(version=2, components=[
        *[component for component in base.components if component.id != "attribute_1"],
        AttributeConfiguration(id="attribute_1", label="Strength", minimum=1, maximum=8, default=5),
        AttributeConfiguration(id="attribute_9", label="Wits", minimum=1, maximum=20, default=7),
    ])


class TestUpgradePreview:
    def test_nothing_to_preview_on_the_latest_version(self, version_repo, built_on_v1):
        assert GetCharacterUpgradePreview(version_repo).execute(built_on_v1) is None

    def test_preview_carries_values_and_names_the_changes(
        self, campaign_repo, version_repo, campaign, host, built_on_v1, make_character_config,
    ):
        v2 = publish(campaign_repo, version_repo, campaign, host, v2_config(make_character_config))
        preview = GetCharacterUpgradePreview(version_repo).execute(built_on_v1)
        assert preview.latest_version == 2 and preview.latest_version_id == v2.id
        assert [(change.component_id, change.kind) for change in preview.changes] == [
            ("attribute_1", "changed"), ("attribute_9", "added")]
        # Strength is out of the new range and kept regardless; Wits seeded at its default.
        assert preview.reconciliation.values["attribute_1"].score == 10
        assert preview.reconciliation.values["attribute_9"].score == 7
        assert preview.reconciliation.added == ["attribute_9"]


class TestAdoptConfigVersion:
    def test_owner_moves_to_the_latest_version_with_confirmed_values(
        self, character_repo, version_repo, game_repo, campaign_repo, campaign, host, player, built_on_v1, make_character_config,
    ):
        v2 = publish(campaign_repo, version_repo, campaign, host, v2_config(make_character_config))
        values = dict(built_on_v1.values)
        values["attribute_9"] = AttributeValue(component_id="attribute_9", score=12)
        updated = AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
            character_id=built_on_v1.id, requesting_user_id=player.id, values=values)
        reloaded = character_repo.get_by_id(updated.id)
        assert reloaded.config_version_id == v2.id
        assert reloaded.config_snapshot.version == 2
        assert reloaded.values["attribute_9"].score == 12
        assert reloaded.display_name == "Brannoc"

    def test_host_cannot_update_someone_elses_character(
        self, character_repo, version_repo, game_repo, campaign_repo, campaign, host, built_on_v1, make_character_config,
    ):
        publish(campaign_repo, version_repo, campaign, host, v2_config(make_character_config))
        with pytest.raises(PermissionError):
            AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
                character_id=built_on_v1.id, requesting_user_id=host.id, values=dict(built_on_v1.values))

    def test_refused_when_already_on_the_latest(self, character_repo, version_repo, game_repo, player, built_on_v1):
        with pytest.raises(ValueError, match="already on the latest"):
            AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
                character_id=built_on_v1.id, requesting_user_id=player.id, values=dict(built_on_v1.values))

    def test_refused_while_a_game_is_running(
        self, character_repo, version_repo, game_repo, campaign_repo, campaign, session, host, player, built_on_v1,
        make_character_config, create_game,
    ):
        publish(campaign_repo, version_repo, campaign, host, v2_config(make_character_config))
        create_game(session_id=session.id, campaign_id=campaign.id, host_id=host.id)
        with pytest.raises(ValueError, match="game is running"):
            AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
                character_id=built_on_v1.id, requesting_user_id=player.id, values=dict(built_on_v1.values))

    def test_required_identity_must_be_answered_on_the_new_version(
        self, character_repo, version_repo, game_repo, campaign_repo, campaign, host, player, built_on_v1, make_character_config,
    ):
        base = make_character_config(version=2)
        with_title = CharacterConfig(version=2, components=[
            *base.components,
            IdentityConfiguration(id="identity_2", label="Calling", input=TextIdentityInput(), required=True),
        ])
        publish(campaign_repo, version_repo, campaign, host, with_title)
        values = dict(built_on_v1.values)
        values["identity_2"] = IdentityValue(component_id="identity_2", answer=TextIdentityAnswer(text="  "))
        with pytest.raises(ValueError, match="Missing required: Calling"):
            AdoptConfigVersion(character_repo, version_repo, game_repo).execute(
                character_id=built_on_v1.id, requesting_user_id=player.id, values=values)
