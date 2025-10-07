# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Game participation checks and access control.

Handles game-specific authorization:
- can_take_turn: Check if user can take actions in game
- game participation validation
- active session access control
"""

from fastapi import Depends, HTTPException, status
from uuid import UUID

from user.domain.aggregates import UserAggregate
from campaign.repositories.campaign_repository import CampaignRepository
from campaign.dependencies.repositories import campaign_repository
from shared.dependencies.auth import get_current_user_from_token

async def verify_game_access(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
) -> UserAggregate:
    """
    Verify that current user has access to the specified game.
    
    This checks if user is either:
    - DM of the campaign containing the game
    - Player in the game session
    
    Args:
        game_id: Game to check access for
        current_user: Authenticated user
        campaign_repo: Campaign repository
        
    Returns:
        UserAggregate: Authenticated user (if they have access)
        
    Raises:
        HTTPException: If user doesn't have access to game
    """
    game = campaign_repo.get_game_by_id(game_id)
    if not game:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Game not found"
        )
    
    # Check if user is DM
    if game.dm_id == current_user.id:
        return current_user
    
    # TODO: Add player participation check when player system is implemented
    # For now, only DM has access
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied - only DM or players can access this game"
    )