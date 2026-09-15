# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The system a campaign is played with, by name. A name for now."""

import uuid

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate


def make_campaign(**overrides):
    fields = {"title": "Secret to Bear", "description": "", "created_by": uuid.uuid4()}
    fields.update(overrides)
    return CampaignAggregate.create(**fields)


class TestSystemName:
    def test_unsaid_by_default(self):
        assert make_campaign().system_name is None

    def test_set_and_trimmed(self):
        campaign = make_campaign(system_name="  Coriolis ")
        assert campaign.system_name == "Coriolis"

    def test_update_leaves_it_alone_unless_named(self):
        campaign = make_campaign(system_name="D&D 5e")
        campaign.update_details(title="Renamed")
        assert campaign.system_name == "D&D 5e"

    def test_update_clears_on_blank(self):
        campaign = make_campaign(system_name="D&D 5e")
        campaign.update_details(system_name="   ")
        assert campaign.system_name is None

    def test_too_long_rejected(self):
        with pytest.raises(ValueError, match="System name too long"):
            make_campaign(system_name="x" * 81)

    def test_round_trips_through_the_repository(self, campaign_repo, create_user, seed_default_edition):
        host = create_user()
        campaign = make_campaign(created_by=host.id, system_name="Coriolis")
        campaign_repo.save(campaign)
        assert campaign_repo.get_by_id(campaign.id).system_name == "Coriolis"
