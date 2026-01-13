# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID
from sqlalchemy.orm import Session

from .schemas import (
    CampaignCreateRequest,
    CampaignUpdateRequest,
    CampaignResponse,
    CampaignSummaryResponse,
    CampaignMemberResponse,
)
from modules.game.schemas.game_schemas import (
    CreateGameRequest, GameResponse
)
from modules.game.api.endpoints import _to_game_response
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.game.dependencies.repositories import get_game_repository
from modules.game.repositories.game_repository import GameRepository
from modules.campaign.application.commands import (
    CreateCampaign,
    UpdateCampaign,
    DeleteCampaign,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign,
    AcceptCampaignInvite,
    DeclineCampaignInvite
)
from modules.game.application.commands import CreateGame
from modules.campaign.application.queries import (
    GetUserCampaigns,
    GetCampaignById
)
from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from shared.dependencies.auth import get_current_user_from_token
from shared.dependencies.db import get_db
from modules.user.domain.user_aggregate import UserAggregate
from modules.user.orm.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager
from sqlalchemy.orm import Session

router = APIRouter()


# Helper functions for response construction

def _to_campaign_response(campaign: CampaignAggregate, user_repo: UserRepository = None) -> CampaignResponse:
    """Convert CampaignAggregate to CampaignResponse"""
    # Campaign now only stores game_ids, not full game objects
    # Frontend should fetch games separately from /api/games/campaign/{id}

    # Look up host screen name if user_repo provided
    host_screen_name = None
    if user_repo:
        host_user = user_repo.get_by_id(campaign.host_id)
        if host_user:
            host_screen_name = host_user.screen_name

    return CampaignResponse(
        id=str(campaign.id),
        title=campaign.title,
        description=campaign.description,
        hero_image=campaign.hero_image,
        host_id=str(campaign.host_id),
        host_screen_name=host_screen_name,
        assets=campaign.assets,
        scenes=campaign.scenes,
        npc_factory=campaign.npc_factory,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        games=[],  # Games fetched separately via game module
        invited_player_ids=[str(pid) for pid in campaign.invited_player_ids],
        player_ids=[str(pid) for pid in campaign.player_ids],
        total_games=campaign.get_total_games(),
        active_games=0,  # TODO: Query game module for active count
        invited_count=campaign.get_invited_count(),
        player_count=campaign.get_player_count()
    )


def _to_campaign_summary_response(campaign: CampaignAggregate, user_repo: UserRepository = None) -> CampaignSummaryResponse:
    """Convert CampaignAggregate to CampaignSummaryResponse"""

    # Look up host screen name if user_repo provided
    host_screen_name = None
    if user_repo:
        host_user = user_repo.get_by_id(campaign.host_id)
        if host_user:
            host_screen_name = host_user.screen_name

    return CampaignSummaryResponse(
        id=str(campaign.id),
        title=campaign.title,
        description=campaign.description,
        hero_image=campaign.hero_image,
        host_id=str(campaign.host_id),
        host_screen_name=host_screen_name,
        created_at=campaign.created_at,
        updated_at=campaign.updated_at,
        total_games=campaign.get_total_games(),
        active_games=0,  # TODO: Query game module for active count
        invited_player_ids=[str(pid) for pid in campaign.invited_player_ids],
        player_ids=[str(pid) for pid in campaign.player_ids],
        invited_count=campaign.get_invited_count()
    )

# Game is a parent of campaign so we'll define the POST here
@router.post("/games", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    request: CreateGameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """Create a new game within a campaign"""

    try:
        command = CreateGame(game_repo, campaign_repo, event_manager)
        game = command.execute(
            name=request.name,
            campaign_id=request.campaign_id,
            host_id=current_user.id,
            max_players=request.max_players
        )
        return _to_game_response(game, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


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
            host_id=current_user.id,
            title=request.title,
            description=request.description or "",
            hero_image=request.hero_image
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
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all campaigns where user is host"""
    try:
        query = GetUserCampaigns(campaign_repo)
        campaigns = query.execute(current_user.id)

        return [_to_campaign_summary_response(campaign, user_repo) for campaign in campaigns]

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

        # Business rule: Only host can view campaign details
        if not campaign.is_owned_by(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - only host can view campaign details"
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
            host_id=current_user.id,
            title=request.title,
            description=request.description,
            hero_image=request.hero_image
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
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """
    Delete campaign.

    Only allows deletion if there are no ACTIVE game sessions.
    INACTIVE games will be cascade-deleted with the campaign.
    """
    try:
        command = DeleteCampaign(campaign_repo, game_repo)
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


# Player management endpoints
@router.post("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def add_player_to_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Add a player to the campaign (host only)"""
    try:
        command = AddPlayerToCampaign(campaign_repo, user_repo, event_manager)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            host_id=current_user.id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def remove_player_from_campaign(
    campaign_id: UUID,
    player_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Remove a player from the campaign (host only)"""
    try:
        command = RemovePlayerFromCampaign(campaign_repo, user_repo, event_manager)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            host_id=current_user.id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{campaign_id}/invites/accept", response_model=CampaignResponse)
async def accept_campaign_invite(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """
    Accept a campaign invite (player only).

    Automatically adds the player to any active games in the campaign.
    """
    try:
        command = AcceptCampaignInvite(campaign_repo, user_repo, event_manager, game_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=current_user.id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/invites", response_model=CampaignResponse)
async def decline_campaign_invite(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Decline a campaign invite (player only)"""
    try:
        command = DeclineCampaignInvite(campaign_repo, user_repo, event_manager)
        campaign = command.execute(
            campaign_id=campaign_id,
            player_id=current_user.id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{campaign_id}/members", response_model=List[CampaignMemberResponse])
async def get_campaign_members(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    db: Session = Depends(get_db)
):
    """
    Get all campaign members with character details.

    Returns campaign host (DM) and all accepted players with their characters.
    Players without characters show null character fields.

    Authorization: Only campaign members can view member list.
    """
    try:
        campaign = campaign_repo.get_by_id(campaign_id)

        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )

        # Verify user is member
        if not campaign.is_member(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - only campaign members can view member list"
            )

        # Execute query
        from modules.campaign.application.queries import GetCampaignMembers
        query = GetCampaignMembers(campaign_repo, db)
        members = query.execute(campaign_id)

        return members

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )

