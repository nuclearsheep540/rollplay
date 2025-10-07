# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Campaign role checks and authorization dependencies.

Handles campaign-specific authorization:
- is_dm: Check if user is DM of campaign
- can_edit_campaign: Check campaign edit permissions
- campaign ownership validation
"""

from fastapi import Depends, HTTPException, status
from uuid import UUID

from modules.user.domain.user_aggregate import UserAggregate
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.dependencies.repositories import campaign_repository
from shared.dependencies.auth import get_current_user_from_token

async def verify_campaign_dm(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
) -> UserAggregate:
    """
    Verify that current user is DM of the specified campaign.
    
    Args:
        campaign_id: Campaign to check
        current_user: Authenticated user
        campaign_repo: Campaign repository
        
    Returns:
        UserAggregate: Authenticated user (if they are DM)
        
    Raises:
        HTTPException: If user is not DM of campaign
    """
    campaign = campaign_repo.get_by_id(campaign_id)
    if not campaign:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Campaign not found"
        )
    
    if not campaign.is_owned_by(current_user.id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the DM can perform this action"
        )
    
    return current_user