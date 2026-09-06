# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The one-session invariant: a campaign has exactly one session, for life.

Created with the campaign, replaced wholesale by a reset, never absent and never
doubled. Everything downstream leans on it — the Home hero reads
`campaign.sessions[0]`, the drawer offers Start against it, and the start ETL
restores token boards and the adventure log from that single row. A second row
would give a campaign two boards and two logs with no rule for which one a game
begins from; zero rows would leave surfaces rendering a game that cannot exist.

This file used to test a `session_name` conditional on campaign creation — a
session was made only when the create form supplied a name. Names are gone (one
session needs no name to tell it apart) and creation is unconditional, so the
rule worth pinning is the invariant itself.

DB-free: the aggregate rules are pure.
"""

from uuid import uuid4

import pytest

from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus


def make_campaign(created_by=None):
    """A fresh campaign per call — nothing is shared between tests."""
    return CampaignAggregate.create(
        title="Curse of Strahd",
        description="Gothic horror",
        created_by=created_by or uuid4(),
    )


class TestOneSessionPerCampaign:
    def test_a_second_session_is_refused(self):
        campaign = make_campaign()
        campaign.add_session(uuid4())

        with pytest.raises(ValueError, match="already has a session"):
            campaign.add_session(uuid4())

    def test_the_same_session_cannot_be_attached_twice(self):
        campaign = make_campaign()
        session_id = uuid4()
        campaign.add_session(session_id)

        with pytest.raises(ValueError, match="already belongs"):
            campaign.add_session(session_id)

    def test_a_replacement_attaches_once_the_old_one_is_gone(self):
        """What a reset does: the row is deleted, so the campaign can take a new
        one. session_ids is read-derived from the sessions table, so dropping the
        id here mirrors the delete the repository has already performed."""
        campaign = make_campaign()
        original_id = uuid4()
        campaign.add_session(original_id)

        campaign.session_ids.remove(original_id)
        replacement_id = uuid4()
        campaign.add_session(replacement_id)

        assert campaign.session_ids == [replacement_id]


class TestSessionIsUnnamedAndSeatless:
    def test_created_session_carries_neither(self):
        campaign_id = uuid4()
        host_id = uuid4()

        session = SessionEntity.create(campaign_id=campaign_id, host_id=host_id)

        assert session.campaign_id == campaign_id
        assert session.host_id == host_id
        assert session.status == SessionStatus.INACTIVE
        assert not hasattr(session, "name")
        assert not hasattr(session, "max_players")

    def test_seats_live_on_the_campaign_instead(self):
        campaign = make_campaign()
        assert campaign.max_players == 8

        campaign.update_details(max_players=5)
        assert campaign.max_players == 5


class TestCampaignSeatCount:
    @pytest.mark.parametrize("seats", [0, 9, -1])
    def test_out_of_range_is_refused(self, seats):
        """api-game builds its seat layout from this, so a number outside 1-8
        would produce a table the runtime cannot render."""
        with pytest.raises(ValueError, match="between 1 and 8"):
            CampaignAggregate.create(
                title="Curse of Strahd",
                description="",
                created_by=uuid4(),
                max_players=seats,
            )

    def test_non_integer_is_refused(self):
        campaign = make_campaign()
        with pytest.raises(ValueError, match="must be an integer"):
            campaign.update_details(max_players="six")

    def test_omitting_it_on_an_edit_leaves_it_alone(self):
        """Every other field on the form must be editable without resetting seats."""
        campaign = make_campaign()
        campaign.update_details(max_players=3)

        campaign.update_details(title="Renamed")

        assert campaign.max_players == 3
