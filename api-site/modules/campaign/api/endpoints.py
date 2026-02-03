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
    CharacterSelectRequest,
)
from modules.session.schemas.session_schemas import (
    CreateSessionRequest, SessionResponse
)
from modules.session.api.endpoints import _to_session_response
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.session.dependencies.repositories import get_session_repository
from modules.session.repositories.session_repository import SessionRepository
from modules.campaign.application.commands import (
    CreateCampaign,
    UpdateCampaign,
    DeleteCampaign,
    AddPlayerToCampaign,
    RemovePlayerFromCampaign,
    AcceptCampaignInvite,
    DeclineCampaignInvite,
    CancelCampaignInvite,
    LeaveCampaign,
    SelectCharacterForCampaign,
    ReleaseCharacterFromCampaign
)
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.dependencies.providers import get_character_repository
from modules.session.application.commands import CreateSession
from modules.campaign.application.queries import (
    GetUserCampaigns,
    GetCampaignById,
    GetUserHostedCampaigns
)
from modules.campaign.domain.campaign_aggregate import CampaignAggregate
from shared.dependencies.auth import get_current_user_from_token, get_current_user_id
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
    # Campaign now only stores session_ids, not full session objects
    # Frontend should fetch sessions separately from /api/sessions/campaign/{id}

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
        sessions=[],  # Sessions fetched separately via session module
        invited_player_ids=[str(pid) for pid in campaign.invited_player_ids],
        player_ids=[str(pid) for pid in campaign.player_ids],
        total_sessions=campaign.get_total_sessions(),
        active_sessions=0,  # TODO: Query session module for active count
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
        total_sessions=campaign.get_total_sessions(),
        active_sessions=0,  # TODO: Query session module for active count
        invited_player_ids=[str(pid) for pid in campaign.invited_player_ids],
        player_ids=[str(pid) for pid in campaign.player_ids],
        invited_count=campaign.get_invited_count()
    )

# Session is a child of campaign so we'll define the POST here
@router.post("/sessions", response_model=SessionResponse, status_code=status.HTTP_201_CREATED)
async def create_session(
    request: CreateSessionRequest,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """Create a new session within a campaign"""

    try:
        command = CreateSession(session_repo, campaign_repo, event_manager)
        session = await command.execute(
            name=request.name,
            campaign_id=request.campaign_id,
            host_id=user_id,
            max_players=request.max_players
        )
        return _to_session_response(session, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# Campaign endpoints
@router.post("/", response_model=CampaignResponse)
async def create_campaign(
    request: CampaignCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Create a new campaign, optionally with an initial session"""
    try:
        command = CreateCampaign(campaign_repo)
        campaign = command.execute(
            host_id=user_id,
            title=request.title,
            description=request.description or "",
            hero_image=request.hero_image
        )

        # Always create a session with the campaign
        session_name = request.session_name.strip() if request.session_name else None
        session_command = CreateSession(session_repo, campaign_repo, event_manager)
        await session_command.execute(
            name=session_name,
            campaign_id=campaign.id,
            host_id=user_id,
            max_players=8
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
    user_repo: UserRepository = Depends(get_user_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Get all campaigns where user is host or member"""
    try:
        # Create demo campaign for first-time users (only once per account)
        if not current_user.has_received_demo:
            DEMO_CAMPAIGN_TEMPLATE = {
                "title": "Shadows of the Astral Forge",
                "description": "The world of Elyndor has been thrown off balance after a celestial fracture split the night sky, showering the land with star-shards—ancient cosmic fragments pulsing with unstable energy. These shards have awakened long-dormant ruins, warped creatures into monstrous forms, and drawn power-hungry factions into open conflict.\n\nAt the heart of the chaos lies the Astral Forge, an ancient floating sanctum said to predate the gods themselves. Legends speak of its power to reshape reality—or unmake it entirely. Now, with star-shards acting as keys to its gates, the race is on.\n\nYour party begins as a ragtag group of outcasts, each touched by the celestial event in strange and personal ways. As you delve into crumbling temples, forge uneasy alliances, and battle eldritch horrors, you'll uncover the true nature of the shards—and the terrible cost of wielding their power.",
                "hero_image": "/floating-city.png",
                "session_name": "Demo Session"
            }
            try:
                command = CreateCampaign(campaign_repo)
                campaign = command.execute(
                    host_id=current_user.id,
                    title=DEMO_CAMPAIGN_TEMPLATE["title"],
                    description=DEMO_CAMPAIGN_TEMPLATE["description"],
                    hero_image=DEMO_CAMPAIGN_TEMPLATE["hero_image"]
                )

                # Always create session with campaign
                session_command = CreateSession(session_repo, campaign_repo, event_manager)
                await session_command.execute(
                    name=DEMO_CAMPAIGN_TEMPLATE["session_name"],
                    campaign_id=campaign.id,
                    host_id=current_user.id,
                    max_players=8
                )
            except Exception:
                # Don't fail the request if demo creation fails
                pass

            # Mark user as having received demo (even if creation failed, don't retry)
            current_user.has_received_demo = True
            user_repo.save(current_user)

        query = GetUserCampaigns(campaign_repo)
        campaigns = query.execute(current_user.id)

        return [_to_campaign_summary_response(campaign, user_repo) for campaign in campaigns]

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/hosted", response_model=List[CampaignSummaryResponse])
async def get_user_hosted_campaigns(
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Get all campaigns where user is the DM/host (for friend invites)"""
    try:
        query = GetUserHostedCampaigns(campaign_repo)
        campaigns = query.execute(user_id)

        return [_to_campaign_summary_response(campaign, user_repo) for campaign in campaigns]

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{campaign_id}", response_model=CampaignResponse)
async def get_campaign(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get campaign by ID with all sessions"""
    try:
        query = GetCampaignById(campaign_repo)
        campaign = query.execute(campaign_id)

        if not campaign:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Campaign not found"
            )

        # Business rule: Only host can view campaign details
        if not campaign.is_owned_by(user_id):
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
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    session_repo: SessionRepository = Depends(get_session_repository)
):
    """Update campaign details and optionally current session name"""
    try:
        command = UpdateCampaign(campaign_repo, session_repo)
        campaign = command.execute(
            campaign_id=campaign_id,
            host_id=user_id,
            title=request.title,
            description=request.description,
            hero_image=request.hero_image,
            session_name=request.session_name
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
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    session_repo: SessionRepository = Depends(get_session_repository)
):
    """
    Delete campaign.

    Only allows deletion if there are no ACTIVE sessions.
    INACTIVE sessions will be cascade-deleted with the campaign.
    """
    try:
        command = DeleteCampaign(campaign_repo, session_repo)
        success = command.execute(campaign_id, user_id)

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
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Add a player to the campaign (host only)"""
    try:
        command = AddPlayerToCampaign(campaign_repo, user_repo, event_manager)
        campaign = await command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            host_id=user_id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/players/{player_id}", response_model=CampaignResponse)
async def remove_player_from_campaign(
    campaign_id: UUID,
    player_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Remove a player from the campaign (host only). Also unlocks their character."""
    try:
        command = RemovePlayerFromCampaign(campaign_repo, user_repo, event_manager, character_repo)
        campaign = await command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            host_id=user_id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{campaign_id}/invites/accept", response_model=CampaignResponse)
async def accept_campaign_invite(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager),
    session_repo: SessionRepository = Depends(get_session_repository)
):
    """
    Accept a campaign invite (player only).

    Automatically adds the player to any active sessions in the campaign.
    """
    try:
        command = AcceptCampaignInvite(campaign_repo, user_repo, event_manager, session_repo)
        campaign = await command.execute(
            campaign_id=campaign_id,
            player_id=user_id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/invites", response_model=CampaignResponse)
async def decline_campaign_invite(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Decline a campaign invite (player only)"""
    try:
        command = DeclineCampaignInvite(campaign_repo, user_repo, event_manager)
        campaign = await command.execute(
            campaign_id=campaign_id,
            player_id=user_id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/invites/{player_id}", response_model=CampaignResponse)
async def cancel_campaign_invite(
    campaign_id: UUID,
    player_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """Cancel a pending campaign invite (host only)"""
    try:
        command = CancelCampaignInvite(campaign_repo, user_repo, event_manager)
        campaign = await command.execute(
            campaign_id=campaign_id,
            player_id=player_id,
            host_id=user_id
        )
        return _to_campaign_response(campaign)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{campaign_id}/leave")
async def leave_campaign(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """
    Leave a campaign (player only - host cannot leave their own campaign).

    Also unlocks any character the player had selected for this campaign.
    """
    try:
        command = LeaveCampaign(campaign_repo, user_repo, event_manager, character_repo)
        await command.execute(
            campaign_id=campaign_id,
            player_id=user_id
        )
        return {"message": "Successfully left the campaign"}
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{campaign_id}/members", response_model=List[CampaignMemberResponse])
async def get_campaign_members(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
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

        # Verify user is member or has pending invite
        is_invited = user_id in campaign.invited_player_ids
        if not campaign.is_member(user_id) and not is_invited:
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


# Character selection endpoints
@router.post("/{campaign_id}/select-character")
async def select_character_for_campaign(
    campaign_id: UUID,
    request: CharacterSelectRequest,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Select a character for use in this campaign.

    Locks the character to this campaign - it cannot be used in other campaigns
    until the player leaves the campaign or releases the character.

    Domain Rule: A character can only be active in one campaign at a time.
    """
    try:
        command = SelectCharacterForCampaign(campaign_repo, character_repo, user_repo, event_manager)
        character = await command.execute(
            campaign_id=campaign_id,
            user_id=user_id,
            character_id=UUID(request.character_id)
        )
        return {
            "message": "Character selected for campaign",
            "character_id": str(character.id),
            "character_name": character.character_name
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{campaign_id}/my-character")
async def release_character_from_campaign(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Release your character from this campaign (stay as member without character).

    Only allowed when no active session exists in the campaign.
    After releasing, the character can be used in other campaigns.

    Domain Rule: Cannot release character while a session is active.
    """
    try:
        command = ReleaseCharacterFromCampaign(campaign_repo, character_repo, session_repo, user_repo, event_manager)
        character = await command.execute(
            campaign_id=campaign_id,
            user_id=user_id
        )
        return {
            "message": "Character released from campaign",
            "character_id": str(character.id),
            "character_name": character.character_name
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
