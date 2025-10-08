# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from modules.campaign.schemas.campaign_schemas import (
    CampaignCreateRequest,
    CampaignUpdateRequest,
    CampaignResponse,
    CampaignSummaryResponse
)
from modules.campaign.schemas.game_schemas import (
    GameCreateRequest,
    GameUpdateRequest,
    GameStartRequest,
    GameResponse,
    DMStatusResponse
)
from modules.campaign.dependencies.repositories import campaign_repository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.application.commands import (
    CreateCampaign,
    UpdateCampaign,
    DeleteCampaign,
    CreateGame,
    StartGame,
    EndGame,
    DeleteGame,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign
)
from modules.campaign.application.queries import (
    GetUserCampaigns,
    GetCampaignById,
    GetCampaignGames,
    GetGameById,
    CheckGameDMStatus
)
from modules.campaign.domain.campaign_aggregate import CampaignAggregate, GameEntity
from shared.dependencies.auth import get_current_user_from_token
from modules.user.domain.user_aggregate import UserAggregate

router = APIRouter()


# Helper functions for response construction

def _to_game_response(game: GameEntity) -> GameResponse:
    """Convert GameEntity to GameResponse"""
    return GameResponse(
        id=str(game.id),
        name=game.name,
        campaign_id=str(game.campaign_id),
        dm_id=str(game.dm_id),
        max_players=game.max_players,
        status=game.status.value,
        mongodb_session_id=game.mongodb_session_id,
        created_at=game.created_at,
        updated_at=game.updated_at,
        started_at=game.started_at,
        ended_at=game.ended_at,
        session_duration_seconds=game.get_session_duration()
    )


def _to_campaign_response(campaign: CampaignAggregate) -> CampaignResponse:
    """Convert CampaignAggregate to CampaignResponse"""
    games = [_to_game_response(game) for game in campaign.games]
    active_games = len(campaign.get_active_games())

    return CampaignResponse(
        id=str(campaign.id),
        name=campaign.name,
        description=campaign.description,
        dm_id=str(campaign.dm_id),
        maps=campaign.maps,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        games=games,
        player_ids=[str(player_id) for player_id in campaign.player_ids],
        total_games=campaign.get_total_games(),
        active_games=active_games,
        player_count=campaign.get_player_count()
    )


def _to_campaign_summary_response(campaign: CampaignAggregate) -> CampaignSummaryResponse:
    """Convert CampaignAggregate to CampaignSummaryResponse"""
    active_games = len(campaign.get_active_games())

    return CampaignSummaryResponse(
        id=str(campaign.id),
        name=campaign.name,
        description=campaign.description,
        dm_id=str(campaign.dm_id),
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        total_games=campaign.get_total_games(),
        active_games=active_games
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


# Game endpoints

@router.post("/{campaign_id}/games/", response_model=GameResponse)
async def create_game(
    campaign_id: UUID,
    request: GameCreateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
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

        return _to_game_response(game)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{campaign_id}/games/", response_model=List[GameResponse])
async def get_campaign_games(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get all games in a campaign"""
    try:
        query = GetCampaignGames(campaign_repo)
        games = query.execute(campaign_id)

        return [_to_game_response(game) for game in games]

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
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Start a game session (transition to hot storage)"""
    try:
        # Verify DM status first
        check_query = CheckGameDMStatus(campaign_repo)
        dm_status = check_query.execute(game_id, current_user.id)

        if not dm_status["is_dm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the DM can start this game"
            )

        command = StartGame(campaign_repo)
        game = command.execute(game_id, request.mongodb_session_id)

        return _to_game_response(game)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/games/{game_id}/end", response_model=GameResponse)
async def end_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """End a game session (transition back to cold storage)"""
    try:
        # Verify DM status first
        check_query = CheckGameDMStatus(campaign_repo)
        dm_status = check_query.execute(game_id, current_user.id)

        if not dm_status["is_dm"]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Only the DM can end this game"
            )

        command = EndGame(campaign_repo)
        game = command.execute(game_id)

        return _to_game_response(game)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/games/{game_id}", response_model=GameResponse)
async def delete_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Delete a game (only if INACTIVE)"""
    try:
        command = DeleteGame(campaign_repo)
        game = command.execute(game_id, current_user.id)

        return _to_game_response(game)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/games/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get game by ID"""
    try:
        query = GetGameById(campaign_repo)
        game = query.execute(game_id)

        if not game:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Game not found"
            )

        return _to_game_response(game)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/games/{game_id}/dm-status", response_model=DMStatusResponse)
async def check_dm_status(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Check if authenticated user is DM of the game"""
    try:
        query = CheckGameDMStatus(campaign_repo)
        result = query.execute(game_id, current_user.id)

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
