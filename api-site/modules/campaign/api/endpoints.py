# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from .schemas import (
    CampaignCreateRequest,
    CampaignUpdateRequest,
    CampaignResponse,
    CampaignSummaryResponse
)
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.application.commands import (
    CreateCampaign,
    UpdateCampaign,
    DeleteCampaign,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign
)
from modules.campaign.application.queries import (
    GetUserCampaigns,
    GetCampaignById
)
from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from shared.dependencies.auth import get_current_user_from_token
from modules.user.domain.user_aggregate import UserAggregate

router = APIRouter()


# Helper functions for response construction

def _to_campaign_response(campaign: CampaignAggregate) -> CampaignResponse:
    """Convert CampaignAggregate to CampaignResponse"""
    # Campaign now only stores game_ids, not full game objects
    # Frontend should fetch games separately from /api/games/campaign/{id}

    return CampaignResponse(
        id=str(campaign.id),
        name=campaign.name,
        description=campaign.description,
        dm_id=str(campaign.dm_id),
        maps=campaign.maps,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        games=[],  # Games fetched separately via game module
        player_ids=[str(player_id) for player_id in campaign.player_ids],
        total_games=campaign.get_total_games(),
        active_games=0,  # TODO: Query game module for active count
        player_count=campaign.get_player_count()
    )


def _to_campaign_summary_response(campaign: CampaignAggregate) -> CampaignSummaryResponse:
    """Convert CampaignAggregate to CampaignSummaryResponse"""

    return CampaignSummaryResponse(
        id=str(campaign.id),
        name=campaign.name,
        description=campaign.description,
        dm_id=str(campaign.dm_id),
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        total_games=campaign.get_total_games(),
        active_games=0  # TODO: Query game module for active count
    )


# Campaign endpoints

@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    request: CampaignCreateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Create a new campaign"""
    try:
        command = CreateCampaign(campaign_repo)
        campaign = command.execute(
            dm_id=current_user.id,
            name=request.name,
            description=request.description or ""
        )

        return _to_campaign_response(campaign)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[CampaignSummaryResponse])
async def get_user_campaigns(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get all campaigns where user is DM"""
    try:
        query = GetUserCampaigns(campaign_repo)
        campaigns = query.execute(current_user.id)

        return [_to_campaign_summary_response(campaign) for campaign in campaigns]

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get campaign by ID with all games"""
    try:
        query = GetCampaignById(campaign_repo)
        campaign = query.execute(campaign_id)

        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )

        # Business rule: Only DM can view campaign details
        if not campaign.is_owned_by(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - only DM can view campaign details"
            )

        return _to_campaign_response(campaign)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{campaign_id}", response_model=CampaignResponse)
async def update_campaign(
    campaign_id: UUID,
    request: CampaignUpdateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Update campaign details"""
    try:
        command = UpdateCampaign(campaign_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            dm_id=current_user.id,
            name=request.name,
            description=request.description
        )

        return _to_campaign_response(campaign)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Delete campaign"""
    try:
        command = DeleteCampaign(campaign_repo)
        success = command.execute(campaign_id, current_user.id)

        if success:
            return {"message": "Campaign deleted successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# Game endpoints - DEPRECATED: Moved to /api/games router
# See modules/game/api/endpoints.py for game management

# NOTE: All game-related endpoints have been moved to the Game aggregate module
# Use /api/games/* routes instead of /api/campaigns/{id}/games/*


# DM Status check moved to game module
# @router.get("/games/{game_id}/dm-status", response_model=DMStatusResponse)
# DEPRECATED: Use game module endpoints instead


# Player management endpoints

@router.post("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def add_player_to_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Add a player to campaign (DM only)"""
    try:
        command = AddPlayerToCampaign(campaign_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            dm_id=current_user.id
        )

        return _to_campaign_response(campaign)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def remove_player_from_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Remove a player from campaign (DM or self-removal)"""
    try:
        command = RemovePlayerFromCampaign(campaign_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            requesting_user_id=current_user.id
        )

        return _to_campaign_response(campaign)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
