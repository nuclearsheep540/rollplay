# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The campaign's character config: draft, publish, and the state a reader gets.

Save and publish are different verbs. Saving writes the GM's working copy as often as
they like and versions nothing; publishing mints the next immutable version from that
draft and clears it. Published versions are never updated — a character that was built
against one keeps rendering from it forever.
"""

import pytest
from shared_contracts.character_config import CharacterConfig, diff_configs
from shared_contracts.components.attribute import AttributeConfiguration
from shared_contracts.components.hit_points import HitPointsConfiguration, IntHitPointsRules
from shared_contracts.components.identity import IdentityConfiguration, IdentityValue, TextIdentityAnswer, TextIdentityInput

from modules.campaign.application.commands import (
    PublishCharacterConfigVersion,
    SaveCharacterConfigDraft,
)
from modules.campaign.repositories.character_config_version_repository import (
    CharacterConfigVersionRepository,
)


def make_config(version=1, maximum=20, with_wits=True):
    """A fresh config per call — never a module constant."""
    components = [
        IdentityConfiguration(id="identity_1", label="Name", input=TextIdentityInput()),
        HitPointsConfiguration(id="hit_points_1", label="Vitality",
                               rules=IntHitPointsRules(minimum=0, maximum=maximum)),
        AttributeConfiguration(id="attribute_1", label="Strength", minimum=1, maximum=20, default=10),
    ]
    if with_wits:
        components.append(
            AttributeConfiguration(id="attribute_3", label="Wits", minimum=1, maximum=20, default=10))
    return CharacterConfig(version=version, components=components)


@pytest.fixture
def version_repo(db_session):
    return CharacterConfigVersionRepository(db_session)


@pytest.fixture
def host(create_user):
    return create_user(email="gm@example.com", screen_name="Matt")


@pytest.fixture
def outsider(create_user):
    return create_user(email="other@example.com", screen_name="Someone")


@pytest.fixture
def campaign(create_campaign, host, seed_default_edition):
    return create_campaign(host_id=host.id, title="Secret to Bear")


class TestSaveDraft:
    def test_host_writes_the_draft(self, campaign_repo, version_repo, campaign, host):
        SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id, config=make_config())
        reloaded = campaign_repo.get_by_id(campaign.id)
        assert reloaded.character_config_draft is not None
        assert len(reloaded.character_config_draft.components) == 4

    def test_non_host_refused(self, campaign_repo, version_repo, campaign, outsider):
        with pytest.raises(PermissionError):
            SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
                campaign_id=campaign.id, host_id=outsider.id, config=make_config())

    def test_draft_version_is_forced_to_the_next_number(self, campaign_repo, version_repo, campaign, host):
        """Whatever the client sends as `version`, the draft is always the next unpublished
        number — a GM cannot mint a version by typing one."""
        SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id, config=make_config(version=97))
        assert campaign_repo.get_by_id(campaign.id).character_config_draft.version == 1

    def test_saving_twice_keeps_one_draft(self, campaign_repo, version_repo, campaign, host):
        command = SaveCharacterConfigDraft(campaign_repo, version_repo)
        command.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        command.execute(campaign_id=campaign.id, host_id=host.id, config=make_config(with_wits=False))
        draft = campaign_repo.get_by_id(campaign.id).character_config_draft
        assert len(draft.components) == 3


class TestPublish:
    def test_publishing_without_a_draft_is_refused(self, campaign_repo, version_repo, campaign, host):
        with pytest.raises(ValueError, match="save a draft first"):
            PublishCharacterConfigVersion(campaign_repo, version_repo).execute(
                campaign_id=campaign.id, host_id=host.id)

    def test_publish_mints_version_one_and_clears_the_draft(self, campaign_repo, version_repo, campaign, host):
        SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id, config=make_config())
        record = PublishCharacterConfigVersion(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id)
        assert record.version == 1
        assert campaign_repo.get_by_id(campaign.id).character_config_draft is None
        assert version_repo.get_latest(campaign.id).config.components[0].label == "Name"

    def test_publishing_an_unchanged_draft_is_refused_by_version(self, campaign_repo, version_repo, campaign, host):
        save = SaveCharacterConfigDraft(campaign_repo, version_repo)
        publish = PublishCharacterConfigVersion(campaign_repo, version_repo)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        publish.execute(campaign_id=campaign.id, host_id=host.id)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        with pytest.raises(ValueError, match="No changes since v1"):
            publish.execute(campaign_id=campaign.id, host_id=host.id)

    def test_publishing_a_changed_draft_increments(self, campaign_repo, version_repo, campaign, host):
        save = SaveCharacterConfigDraft(campaign_repo, version_repo)
        publish = PublishCharacterConfigVersion(campaign_repo, version_repo)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        publish.execute(campaign_id=campaign.id, host_id=host.id)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config(maximum=25, with_wits=False))
        record = publish.execute(campaign_id=campaign.id, host_id=host.id)
        assert record.version == 2
        assert [entry.version for entry in version_repo.list_for_campaign(campaign.id)] == [1, 2]

    def test_a_reorder_alone_is_publishable(self, campaign_repo, version_repo, campaign, host):
        """The form renders the GM's order, so a reorder is a change worth a version —
        previously the diff keyed by id and a pure reorder was refused as "no changes"."""
        save = SaveCharacterConfigDraft(campaign_repo, version_repo)
        publish = PublishCharacterConfigVersion(campaign_repo, version_repo)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        publish.execute(campaign_id=campaign.id, host_id=host.id)

        reordered = make_config()
        components = list(reordered.components)
        reordered = CharacterConfig(version=1, components=[components[-1]] + components[:-1])
        save.execute(campaign_id=campaign.id, host_id=host.id, config=reordered)

        latest = version_repo.get_latest(campaign.id)
        draft = campaign_repo.get_by_id(campaign.id).character_config_draft
        assert [(change.component_id, change.fields) for change in diff_configs(latest.config, draft)] == [
            ("attribute_3", ["position"]),
        ]
        record = publish.execute(campaign_id=campaign.id, host_id=host.id)
        assert record.version == 2
        assert record.config.components[0].id == "attribute_3"

    def test_published_versions_are_immutable(self, campaign_repo, version_repo, campaign, host):
        """v1 still reads as v1 after v2 exists — a character built on it is never rewritten."""
        save = SaveCharacterConfigDraft(campaign_repo, version_repo)
        publish = PublishCharacterConfigVersion(campaign_repo, version_repo)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        first = publish.execute(campaign_id=campaign.id, host_id=host.id)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config(maximum=25))
        publish.execute(campaign_id=campaign.id, host_id=host.id)
        assert version_repo.get_by_id(first.id).config.components[1].rules.maximum == 20

    def test_non_host_refused(self, campaign_repo, version_repo, campaign, host, outsider):
        SaveCharacterConfigDraft(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id, config=make_config())
        with pytest.raises(PermissionError):
            PublishCharacterConfigVersion(campaign_repo, version_repo).execute(
                campaign_id=campaign.id, host_id=outsider.id)


class TestPendingChanges:
    def test_diff_between_latest_and_draft_is_what_the_gm_is_shown(
            self, campaign_repo, version_repo, campaign, host):
        save = SaveCharacterConfigDraft(campaign_repo, version_repo)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config())
        PublishCharacterConfigVersion(campaign_repo, version_repo).execute(
            campaign_id=campaign.id, host_id=host.id)
        save.execute(campaign_id=campaign.id, host_id=host.id, config=make_config(maximum=25, with_wits=False))

        latest = version_repo.get_latest(campaign.id)
        draft = campaign_repo.get_by_id(campaign.id).character_config_draft
        changes = diff_configs(latest.config, draft)
        assert [(change.component_id, change.kind) for change in changes] == [
            ("attribute_3", "removed"),
            ("hit_points_1", "changed"),
        ]
        assert changes[1].fields == ["rules.maximum"]
