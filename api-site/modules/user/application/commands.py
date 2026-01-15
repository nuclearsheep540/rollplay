# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional, Tuple
from modules.user.orm.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.application.demo_campaign import CreateDemoCampaign


class GetOrCreateUser:
    def __init__(self, repository: UserRepository, campaign_repository: Optional[CampaignRepository] = None):
        self.repository = repository
        self.campaign_repository = campaign_repository

    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """Get existing user or create new one. Creates demo campaign for new users."""
        user = self.repository.get_by_email(email)
        if user:
            return user, False

        # Create new user through aggregate
        new_user = UserAggregate.create(email)
        self.repository.save(new_user)

        # Create demo campaign for new user if campaign repository is available
        if self.campaign_repository and new_user.id:
            try:
                demo_command = CreateDemoCampaign(self.campaign_repository)
                demo_command.execute(new_user.id)
            except Exception as e:
                # Log but don't fail user creation if demo campaign fails
                print(f"Warning: Failed to create demo campaign for user {new_user.id}: {e}")

        return new_user, True


class UpdateScreenName:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, user_id: str, screen_name: str) -> UserAggregate:
        """Update user screen name with business rule validation"""
        user = self.repository.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")

        # Business logic in aggregate
        user.update_screen_name(screen_name)
        self.repository.save(user)
        return user
