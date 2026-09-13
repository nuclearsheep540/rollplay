# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)

from .schemas import (
    PartyMemberResponse,
    ScheduleSessionRequest,
    SessionResponse,
    SessionListResponse
)
from modules.session.application.commands import (
    ScheduleSession,
    RemovePlayerFromSession,
)
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
from modules.game.dependencies.providers import get_game_repository
from modules.game.repositories.game_repository import GameRepository
from shared.dependencies.auth import get_current_user_id
from shared.services.s3_service import S3Service, get_s3_service
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager


router = APIRouter(tags=["sessions"])


# === Session reads ===
#
# There is no create route: a campaign is born with its session (the campaign
# create endpoint) and never gets another. Starting and ending games live in
# modules/game — they are operations on a game, not on the table it happens at.

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

# === The next game ===

@router.patch("/{session_id}/schedule", status_code=status.HTTP_204_NO_CONTENT)
async def schedule_game(
    session_id: UUID,
    request: ScheduleSessionRequest,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    event_manager: EventManager = Depends(get_event_manager),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """
    Say when the next game is and what it is called — or clear both with nulls
    (host only, and only while no game is running).

    Purely communicative: nothing starts on this date and nobody is reminded. It
    tells the table what the GM intends so they can align. Stored as an instant
    and rendered in each viewer's own timezone. The name is taken by the next
    Start and belongs to that game from then on.
    """
    try:
        command = ScheduleSession(session_repo, campaign_repo, user_repo, event_manager, game_repo)
        await command.execute(
            session_id=session_id,
            host_id=user_id,
            scheduled_at=request.scheduled_at,
            next_game_name=request.next_game_name
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# === The party ===

@router.get("/{session_id}/party", response_model=List[PartyMemberResponse])
def get_party(
    session_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    s3_service: S3Service = Depends(get_s3_service),
):
    """The party: one row per character at this table.

    Roster members who have not built a character are NOT here — the roster is users and is
    already on SessionResponse.joined_users. Values are deliberately absent: a party list is
    who is playing, not their sheets, and secret values must never reach a third player.
    """
    session = session_repo.get_by_id(session_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    if not session.has_user(user_id) and session.host_id != user_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not at this table")

    campaign = campaign_repo.get_by_id(session.campaign_id)
    party = []
    for character in character_repo.get_party_for_session(session_id):
        owner = user_repo.get_by_id(character.user_id)
        role = campaign.get_role(character.user_id) if campaign else None
        avatar_url = None
        if character.avatar_s3_key:
            try:
                avatar_url = s3_service.generate_download_url(character.avatar_s3_key)
            except Exception:
                avatar_url = None
        party.append(PartyMemberResponse(
            user_id=character.user_id,
            screen_name=(owner.screen_name if owner else None) or "Unknown",
            # 'player' is derived from having a character, never stored.
            campaign_role="player" if role and role.value != "dm" else (role.value if role else "player"),
            is_host=session.host_id == character.user_id,
            character_id=character.id,
            display_name=character.display_name,
            is_alive=character.is_alive,
            color=character.color,
            avatar_url=avatar_url,
            avatar_asset_id=character.avatar_asset_id,
            avatar_focal_area=character.avatar_focal_area,
            config_version=character.config_snapshot.version,
        ))
    return party
