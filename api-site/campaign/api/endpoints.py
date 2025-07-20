# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from campaign.schemas.campaign_schemas import (
    CampaignCreateRequest,
    CampaignUpdateRequest, 
    CampaignResponse,
    CampaignSummaryResponse
)
from campaign.schemas.game_schemas import (
    GameCreateRequest,
    GameUpdateRequest,
    GameStartRequest,
    GameResponse,
    DMStatusResponse
)
from campaign.dependencies.repositories import get_campaign_repository
from campaign.adapters.repositories import CampaignRepository
from campaign.application.commands import (
    CreateCampaign,
    GetUserCampaigns,
    GetCampaignById,
    UpdateCampaign,
    DeleteCampaign,
    CreateGame,
    GetCampaignGames,
    StartGame,
    EndGame,
    DeleteGame,
    GetGameById,
    CheckGameDMStatus,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign
)
from shared.dependencies.auth import get_current_user_from_token
from user.domain.aggregates import UserAggregate

router = APIRouter(prefix="/campaigns", tags=["campaigns"])


# Campaign endpoints
@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    request: CampaignCreateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Create a new campaign"""
    try:
        command = CreateCampaign(campaign_repo)
        campaign = command.execute(
            dm_id=current_user.id,
            name=request.name,
            description=request.description or ""
        )
        
        return CampaignResponse.from_aggregate(campaign)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[CampaignSummaryResponse])
async def get_user_campaigns(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Get all campaigns where user is DM"""
    try:
        command = GetUserCampaigns(campaign_repo)
        campaigns = command.execute(current_user.id)
        
        return [CampaignSummaryResponse.from_aggregate(campaign) for campaign in campaigns]
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Get campaign by ID with all games"""
    try:
        command = GetCampaignById(campaign_repo)
        campaign = command.execute(campaign_id)
        
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
        
        return CampaignResponse.from_aggregate(campaign)
        
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
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
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
        
        return CampaignResponse.from_aggregate(campaign)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{campaign_id}")
async def delete_campaign(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
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


# Game endpoints
@router.post("/{campaign_id}/games/", response_model=GameResponse)
async def create_game(
    campaign_id: UUID,
    request: GameCreateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Create a new game in campaign"""
    try:
        command = CreateGame(campaign_repo)
        game = command.execute(
            campaign_id=campaign_id,
            dm_id=current_user.id,
            name=request.name,
            max_players=request.max_players
        )
        
        return GameResponse.from_entity(game)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{campaign_id}/games/", response_model=List[GameResponse])
async def get_campaign_games(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Get all games in a campaign"""
    try:
        command = GetCampaignGames(campaign_repo)
        games = command.execute(campaign_id)
        
        return [GameResponse.from_entity(game) for game in games]
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/games/{game_id}/start", response_model=GameResponse)
async def start_game(
    game_id: UUID,
    request: GameStartRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Start a game session (transition to hot storage)"""
    try:
        # Verify DM status first
        check_command = CheckGameDMStatus(campaign_repo)
        dm_status = check_command.execute(game_id, current_user.id)
        
        if not dm_status["is_dm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the DM can start this game"
            )
        
        command = StartGame(campaign_repo)
        game = command.execute(game_id, request.mongodb_session_id)
        
        return GameResponse.from_entity(game)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/games/{game_id}/end", response_model=GameResponse)
async def end_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """End a game session (transition back to cold storage)"""
    try:
        # Verify DM status first
        check_command = CheckGameDMStatus(campaign_repo)
        dm_status = check_command.execute(game_id, current_user.id)
        
        if not dm_status["is_dm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the DM can end this game"
            )
        
        command = EndGame(campaign_repo)
        game = command.execute(game_id)
        
        return GameResponse.from_entity(game)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/games/{game_id}", response_model=GameResponse)
async def delete_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Delete a game (only if INACTIVE)"""
    try:
        command = DeleteGame(campaign_repo)
        game = command.execute(game_id, current_user.id)
        
        return GameResponse.from_entity(game)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/games/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Get game by ID"""
    try:
        command = GetGameById(campaign_repo)
        game = command.execute(game_id)
        
        if not game:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Game not found"
            )
        
        return GameResponse.from_entity(game)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/games/{game_id}/dm-status", response_model=DMStatusResponse)
async def check_dm_status(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Check if authenticated user is DM of the game"""
    try:
        command = CheckGameDMStatus(campaign_repo)
        result = command.execute(game_id, current_user.id)
        
        return DMStatusResponse(**result)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


# Player management endpoints
@router.post("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def add_player_to_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Add a player to campaign (DM only)"""
    try:
        command = AddPlayerToCampaign(campaign_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            dm_id=current_user.id
        )
        
        return CampaignResponse.from_aggregate(campaign)
        
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
    campaign_repo: CampaignRepository = Depends(get_campaign_repository)
):
    """Remove a player from campaign (DM or self-removal)"""
    try:
        command = RemovePlayerFromCampaign(campaign_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            requesting_user_id=current_user.id
        )
        
        return CampaignResponse.from_aggregate(campaign)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )