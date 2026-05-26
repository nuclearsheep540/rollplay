# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""GET /api/campaigns/{campaign_id}/party — auth + listing."""

from uuid import uuid4

import pytest


def _finalize_character(client, auth_as, owner, name="PartyMember"):
    """Walk a draft to finalized; returns the response body."""
    auth_as(owner.id)
    create = client.post(
        "/api/characters/draft",
        json={"edition_code": "srd_5_2_1", "name": name},
    )
    draft = create.json()
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "identity",
        "identity": {"species_code": "human"},
    })
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "class",
        "class": {
            "classes": [
                {
                    "class_code": "barbarian", "level": 1, "is_primary": True,
                    "chosen_skills": ["athletics", "perception"],
                }
            ]
        },
    })
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "background",
        "background": {
            "background_code": "soldier",
            "ability_increases": [
                {"ability": "strength", "increase": 2},
                {"ability": "constitution", "increase": 1},
            ],
        },
    })
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "ability_scores",
        "ability_scores": {
            "strength": 15, "dexterity": 13, "constitution": 14,
            "intelligence": 8, "wisdom": 12, "charisma": 10,
        },
    })
    client.patch(f"/api/characters/draft/{draft['id']}", json={
        "step": "hp_ac", "hp_ac": {"hp_max": 14, "ac": 14},
    })
    final = client.post(f"/api/characters/draft/{draft['id']}/finalize")
    return final.json()


@pytest.fixture
def dm(create_user):
    return create_user("dm@example.com")


@pytest.fixture
def player(create_user):
    return create_user("player@example.com")


@pytest.fixture
def outsider(create_user):
    return create_user("outsider@example.com")


@pytest.fixture
def campaign_with_party(client, auth_as, dm, player, campaign_repo, character_repo):
    """Build a campaign with DM + one player, with the player's character locked to it."""
    from modules.campaign.domain.campaign_aggregate import CampaignAggregate

    campaign = CampaignAggregate.create(
        title="Test Party",
        description="",
        created_by=dm.id,
    )
    # Add the player as an accepted member (invite + accept condensed).
    campaign.invite_player(player.id)
    campaign.accept_invite(player.id)
    campaign_repo.save(campaign)

    # Player finalises a character and locks it to this campaign.
    char_body = _finalize_character(client, auth_as, player, name="Hero")
    from uuid import UUID
    character = character_repo.get_by_id(UUID(char_body["id"]))
    character.lock_to_campaign(campaign.id)
    character_repo.save(character)
    return campaign


class TestPartyAuth:
    def test_dm_can_view_party(self, client, auth_as, dm, campaign_with_party):
        auth_as(dm.id)
        response = client.get(f"/api/campaigns/{campaign_with_party.id}/party")
        assert response.status_code == 200, response.text
        body = response.json()
        assert len(body) == 1
        assert body[0]["character_name"] == "Hero"

    def test_member_can_view_party(self, client, auth_as, player, campaign_with_party):
        auth_as(player.id)
        response = client.get(f"/api/campaigns/{campaign_with_party.id}/party")
        assert response.status_code == 200, response.text
        assert len(response.json()) == 1

    def test_outsider_forbidden(self, client, auth_as, outsider, campaign_with_party):
        auth_as(outsider.id)
        response = client.get(f"/api/campaigns/{campaign_with_party.id}/party")
        assert response.status_code == 403

    def test_unknown_campaign_returns_404(self, client, auth_as, dm):
        auth_as(dm.id)
        response = client.get(f"/api/campaigns/{uuid4()}/party")
        assert response.status_code == 404
