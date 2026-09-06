# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)

from .schemas import (
    ScheduleSessionRequest,
    SessionResponse,
    SessionListResponse
)
from modules.session.application.commands import (
    StartSession,
    PauseSession,
    ResetSession,
    ScheduleSession,
    RemovePlayerFromSession,
    SelectCharacterForSession,
    DisconnectFromGame
)
from modules.session.domain.session_aggregate import PauseReason
from modules.session.application.queries import (
    GetSessionById,
    GetSessionsByCampaign,
    GetUserSessions,
)
from modules.session.dependencies.providers import get_session_repository
from modules.session.repositories.session_repository import SessionRepository
from modules.user.repositories.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.characters.repositories.character_repository import CharacterRepository
from modules.characters.dependencies.providers import get_character_repository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.campaign.dependencies.providers import campaign_repository
from modules.library.dependencies.providers import get_asset_repository
from modules.library.repositories.asset_repository import MediaAssetRepository
from shared.services.s3_service import S3Service, get_s3_service
from shared.dependencies.auth import get_current_user_id
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager


router = APIRouter(tags=["sessions"])


# === Session reads ===
#
# There is no create route: a campaign is born with its session (the campaign
# create endpoint) and only ever gets another through reset, below.

@router.get("/my-sessions", response_model=SessionListResponse)
async def get_my_sessions(
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository)
):
    """Get all sessions where user is host or invited player"""
    query = GetUserSessions(session_repo)
    sessions = query.execute(user_id)
    return SessionListResponse(sessions=sessions, total=len(sessions))


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository)
):
    """Get session by ID"""
    query = GetSessionById(session_repo)
    session = query.execute(session_id)
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if session.host_id != user_id and user_id not in session.joined_users:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this session")
    return session


@router.get("/campaign/{campaign_id}", response_model=SessionListResponse)
async def get_campaign_sessions(
    campaign_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Get all sessions for a campaign"""
    campaign = campaign_repo.get_by_id(campaign_id)
    if not campaign or not campaign.is_member(user_id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not authorized to view this campaign's sessions")
    query = GetSessionsByCampaign(session_repo)
    sessions = query.execute(campaign_id)
    return SessionListResponse(sessions=sessions, total=len(sessions))


@router.delete("/{session_id}/players/{player_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_player_from_session(
    session_id: UUID,
    player_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Remove a player from the session roster (host only)"""
    try:
        command = RemovePlayerFromSession(session_repo, character_repo)
        command.execute(session_id=session_id, user_id=player_id, removed_by=user_id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# === Session State Actions ===

@router.post("/{session_id}/start", status_code=status.HTTP_204_NO_CONTENT)
async def start_session(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    asset_repo: MediaAssetRepository = Depends(get_asset_repository),
    event_manager: EventManager = Depends(get_event_manager),
    s3_service: S3Service = Depends(get_s3_service)
):
    """
    Start a session (INACTIVE → ACTIVE).

    This endpoint:
    1. Validates session ownership
    2. Sets session status to STARTING
    3. Fetches campaign assets from library
    4. Generates fresh presigned URLs for all assets (parallel)
    5. Calls api-game to create MongoDB active_session with assets + URLs
    6. Sets session status to ACTIVE
    """
    try:
        command = StartSession(session_repo, user_repo, character_repo, campaign_repo, event_manager, asset_repo, s3_service)
        await command.execute(session_id, user_id)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error starting session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start session"
        )


@router.post("/{session_id}/end", status_code=status.HTTP_204_NO_CONTENT)
async def end_game(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    asset_repo: MediaAssetRepository = Depends(get_asset_repository)
):
    """
    End the running game (ACTIVE → INACTIVE) using the fail-safe three-phase pattern.

    The session itself survives — this is what the GM calls "End game", and the
    same session starts again next time carrying its token boards and log. Only
    a reset throws that away.

    This endpoint:
    1. Validates session ownership
    2. Sets session status to STOPPING
    3. PHASE 1: Fetches final state from MongoDB (non-destructive)
    4. PHASE 2: Writes to PostgreSQL (fail-safe - MongoDB preserved on error)
    5. PHASE 3: Background cleanup of MongoDB session
    6. Broadcasts session_ended to every campaign member except the host

    If PostgreSQL write fails, MongoDB session is preserved and error returned.
    """
    try:
        command = PauseSession(session_repo, user_repo, character_repo, campaign_repo, event_manager, asset_repo)
        await command.execute(session_id, user_id, reason=PauseReason.HOST_ENDED)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error ending game for session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to end the game"
        )


@router.patch("/{session_id}/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def schedule_game(
    session_id: UUID,
    request: ScheduleSessionRequest,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Say when the next game is — or clear it by sending null (host only, idle only).

    Purely communicative: nothing starts on this date and nobody is reminded. It
    tells the table what the GM intends so they can align. Stored as an instant
    and rendered in each viewer's own timezone.
    """
    try:
        command = ScheduleSession(session_repo, campaign_repo, user_repo, event_manager)
        await command.execute(
            session_id=session_id,
            host_id=user_id,
            scheduled_at=request.scheduled_at
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{session_id}/reset", response_model=SessionResponse)
async def reset_game(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    event_manager: EventManager = Depends(get_event_manager)
):
    """
    Reset the campaign's game (host only, no game running) — a fresh run.

    Clears the table: every non-DM member is removed and told, their characters
    released, pending invites cancelled. Wipes play state — tokens, the adventure
    log, the schedule, what was on screen, audio and Spotify config — by
    replacing the session row. Assets, notes and the authored npc baselines stay.

    Returns the NEW session: its id differs from the one in the path.
    """
    try:
        command = ResetSession(session_repo, campaign_repo, user_repo, character_repo, event_manager)
        replacement = await command.execute(session_id=session_id, host_id=user_id)
        return GetSessionById(session_repo).execute(replacement.id)  # type: ignore[arg-type]
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

# === Character Actions ===

@router.post("/{session_id}/select-character", status_code=status.HTTP_204_NO_CONTENT)
async def select_character_for_session(
    session_id: UUID,
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Select character for a joined session"""
    try:
        command = SelectCharacterForSession(session_repo, character_repo)
        command.execute(
            session_id=session_id,
            user_id=user_id,
            character_id=character_id
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{session_id}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_from_game(
    session_id: UUID,
    character_id: UUID,
    character_state: dict,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Handle player disconnect from active game (character-level ETL)"""
    try:
        command = DisconnectFromGame(session_repo, character_repo)
        command.execute(
            session_id=session_id,
            user_id=user_id,
            character_id=character_id,
            character_state=character_state
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
