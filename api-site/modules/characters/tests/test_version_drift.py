# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""A character built on an older config version, and what the page tells it about the
versions published since. Information for the player and GM; never a block."""

from shared_contracts.character_config import CharacterConfig
from shared_contracts.components.attribute import AttributeConfiguration

from modules.campaign.repositories.character_config_version_repository import (
    CharacterConfigVersionRepository,
)
from modules.characters.application.queries import GetCharacterVersionDrift


class TestGetCharacterVersionDrift:
    def test_keepsake_has_nothing_to_drift_from(self, db_session, create_user, create_character):
        user = create_user()
        keepsake = create_character(user_id=user.id)
        drift = GetCharacterVersionDrift(CharacterConfigVersionRepository(db_session)).execute(keepsake)
        assert drift.latest_version is None and drift.changes == []

    def test_on_the_latest_version_reports_nothing(
        self, db_session, seed_default_edition, create_user, create_campaign, create_session, create_character,
        make_character_config,
    ):
        host = create_user()
        campaign = create_campaign(host_id=host.id)
        session = create_session(campaign_id=campaign.id, host_id=host.id)
        version_repo = CharacterConfigVersionRepository(db_session)
        published = version_repo.insert(campaign.id, make_character_config(version=1), host.id)
        character = create_character(
            user_id=host.id, campaign_id=campaign.id, session_id=session.id,
            config_version_id=published.id, config=make_character_config(version=1),
        )
        drift = GetCharacterVersionDrift(version_repo).execute(character)
        assert drift.latest_version is None and drift.changes == []

    def test_newer_version_lists_what_changed(
        self, db_session, seed_default_edition, create_user, create_campaign, create_session, create_character,
        make_character_config,
    ):
        host = create_user()
        campaign = create_campaign(host_id=host.id)
        session = create_session(campaign_id=campaign.id, host_id=host.id)
        version_repo = CharacterConfigVersionRepository(db_session)
        v1 = version_repo.insert(campaign.id, make_character_config(version=1), host.id)
        character = create_character(
            user_id=host.id, campaign_id=campaign.id, session_id=session.id,
            config_version_id=v1.id, config=make_character_config(version=1),
        )
        # v2: Vitality's entry bound raised, Wits added.
        v2_config = make_character_config(version=2, hp_maximum=25)
        v2_config = CharacterConfig(version=2, components=[
            *v2_config.components,
            AttributeConfiguration(id="attribute_9", label="Wits", minimum=1, maximum=20, default=10),
        ])
        version_repo.insert(campaign.id, v2_config, host.id)

        drift = GetCharacterVersionDrift(version_repo).execute(character)
        assert drift.latest_version == 2
        assert [(change.component_id, change.kind, change.fields) for change in drift.changes] == [
            ("hit_points_1", "changed", ["rules.maximum"]),
            ("attribute_9", "added", []),
        ]
