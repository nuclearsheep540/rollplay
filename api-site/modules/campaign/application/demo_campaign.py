# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID

from modules.campaign.domain.campaign_aggregate import CampaignAggregate


# Demo campaign template data
DEMO_CAMPAIGN_TEMPLATE = {
    "title": "Shadows of the Astral Forge",
    "description": "The world of Elyndor has been thrown off balance after a celestial fracture split the night sky, showering the land with star-shards—ancient cosmic fragments pulsing with unstable energy. These shards have awakened long-dormant ruins, warped creatures into monstrous forms, and drawn power-hungry factions into open conflict.\n\nAt the heart of the chaos lies the Astral Forge, an ancient floating sanctum said to predate the gods themselves. Legends speak of its power to reshape reality—or unmake it entirely. Now, with star-shards acting as keys to its gates, the race is on.\n\nYour party begins as a ragtag group of outcasts, each touched by the celestial event in strange and personal ways. As you delve into crumbling temples, forge uneasy alliances, and battle eldritch horrors, you'll uncover the true nature of the shards—and the terrible cost of wielding their power.",
    "hero_image": "/floating-city.png"
}


class CreateDemoCampaign:
    """
    Creates a demo campaign for new users.

    This command creates a copy of the demo campaign template
    for a new user, making them the host of their own copy.
    """

    def __init__(self, repository):
        self.repository = repository

    def execute(self, user_id: UUID) -> CampaignAggregate:
        """
        Create a demo campaign for the given user.

        Args:
            user_id: The UUID of the new user who will become the host

        Returns:
            The created CampaignAggregate
        """
        campaign = CampaignAggregate.create(
            title=DEMO_CAMPAIGN_TEMPLATE["title"],
            description=DEMO_CAMPAIGN_TEMPLATE["description"],
            host_id=user_id,
            hero_image=DEMO_CAMPAIGN_TEMPLATE["hero_image"]
        )

        self.repository.save(campaign)
        return campaign
