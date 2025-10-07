# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Tuple, List, Dict, Any
from user.adapters.repositories import UserRepository
from user.domain.aggregates import UserAggregate

class GetOrCreateUser:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    def execute(self, email: str) -> Tuple[UserAggregate, bool]:
        """Get existing user or create new one"""
        user = self.repository.get_by_email(email)
        if user:
            return user, False

        # Create new user through aggregate
        new_user = UserAggregate.create(email)
        self.repository.save(new_user)
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


class GetUserDashboard:
    """Cross-aggregate coordination command for user dashboard"""
    def __init__(self, user_repository: UserRepository, campaign_repository):
        self.user_repo = user_repository
        self.campaign_repo = campaign_repository
    
    def execute(self, user_id) -> Dict[str, Any]:
        """Orchestrate multiple aggregates for dashboard data"""
        # Get user aggregate
        user = self.user_repo.get_by_id(user_id)
        if not user:
            raise ValueError(f"User {user_id} not found")
        
        # Get campaigns aggregate (cross-aggregate coordination)
        campaigns = self.campaign_repo.get_by_dm_id(user_id)
        
        # Calculate dashboard metrics
        total_campaigns = len(campaigns)
        active_games = sum(len(campaign.get_active_games()) for campaign in campaigns)
        total_games = sum(campaign.get_total_games() for campaign in campaigns)
        
        return {
            'user': user,
            'campaigns': campaigns,
            'metrics': {
                'total_campaigns': total_campaigns,
                'total_games': total_games,
                'active_games': active_games,
                'is_dm': total_campaigns > 0
            }
        }