# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Dict, Any, Optional
from modules.user.orm.user_repository import UserRepository
from modules.user.domain.user_aggregate import UserAggregate


class GetUserByEmail:
    """Query to retrieve user by email address"""

    def __init__(self, user_repository: UserRepository):
        self.user_repo = user_repository

    def execute(self, email: str) -> Optional[UserAggregate]:
        """
        Get user by email.

        Args:
            email: User's email address

        Returns:
            UserAggregate if found, None otherwise
        """
        return self.user_repo.get_by_email(email)


class GetUserDashboard:
    """Cross-aggregate coordination query for user dashboard"""
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
        total_sessions = sum(campaign.get_total_sessions() for campaign in campaigns)
        # TODO: Query session repository for active session count
        active_sessions = 0

        return {
            'user': user,
            'campaigns': campaigns,
            'metrics': {
                'total_campaigns': total_campaigns,
                'total_sessions': total_sessions,
                'active_sessions': active_sessions,
                'is_dm': total_campaigns > 0
            }
        }
