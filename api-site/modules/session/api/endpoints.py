# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)

from modules.session.schemas.session_schemas import (
    CreateSessionRequest,
    UpdateSessionRequest,
    SessionResponse,
    SessionListResponse,
    RosterPlayerResponse
)
from modules.session.application.commands import (
    CreateSession,
    StartSession,
    PauseSession,
    FinishSession,
    RemovePlayerFromSession,
    UpdateSession,
    DeleteSession,
    SelectCharacterForSession,
    ChangeCharacterForSession,
    ChangeCharacterDuringGame,
    DisconnectFromGame
)
from modules.session.application.queries import (
    GetSessionById,
    GetSessionsByCampaign,
    GetUserSessions
)
from modules.session.dependencies.repositories import get_session_repository
from modules.session.repositories.session_repository import SessionRepository
from modules.user.orm.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.dependencies.providers import get_character_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.dependencies.providers import campaign_repository
from modules.user.domain.user_aggregate import UserAggregate
from modules.session.domain.session_aggregate import SessionEntity
from shared.dependencies.auth import get_current_user_from_token
from shared.dependencies.db import get_db
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager
from sqlalchemy.orm import Session


router = APIRouter(tags=["sessions"])


def _to_session_response(session: SessionEntity, db: Session) -> SessionResponse:
    """Convert SessionEntity to SessionResponse with enriched roster data"""
    from modules.campaign.model.session_model import SessionJoinedUser
    from modules.user.model.user_model import User
    from modules.characters.model.character_model import Character

    # Fetch host/DM information
    host_user = db.query(User).filter(User.id == session.host_id).first()
    host_name = host_user.screen_name or host_user.email if host_user else "Unknown"

    # Fetch roster data with character and user information
    roster_data = []
    roster_query = db.query(
        SessionJoinedUser,
        User,
        Character
    ).join(
        User, SessionJoinedUser.user_id == User.id
    ).outerjoin(
        Character, SessionJoinedUser.selected_character_id == Character.id
    ).filter(
        SessionJoinedUser.session_id == session.id
    ).all()

    for joined_user, user, character in roster_query:
        # Format character classes for multi-class support
        character_class_str = None
        if character and character.character_classes:
            character_class_str = ' / '.join([cc.character_class.value for cc in character.character_classes])

        roster_data.append(RosterPlayerResponse(
            user_id=user.id,
            username=user.screen_name or user.email,
            character_id=character.id if character else None,
            character_name=character.character_name if character else None,
            character_level=character.level if character else None,
            character_class=character_class_str,
            character_race=character.character_race if character else None,
            joined_at=joined_user.joined_at
        ))

    return SessionResponse(
        id=session.id,
        name=session.name,
        campaign_id=session.campaign_id,
        host_id=session.host_id,
        host_name=host_name,
        status=session.status.value,
        created_at=session.created_at,
        started_at=session.started_at,
        stopped_at=session.stopped_at,
        active_game_id=session.active_game_id,
        joined_users=session.joined_users,
        roster=roster_data,
        player_count=session.player_count,
        max_players=session.max_players
    )


@router.get("/my-sessions", response_model=SessionListResponse)
async def get_my_sessions(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    db: Session = Depends(get_db)
):
    """Get all sessions where user is host or invited player"""
    query = GetUserSessions(session_repo)
    sessions = query.execute(current_user.id)

    return SessionListResponse(
        sessions=[_to_session_response(session, db) for session in sessions],
        total=len(sessions)
    )


@router.get("/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    db: Session = Depends(get_db)
):
    """Get session by ID"""
    query = GetSessionById(session_repo)
    session = query.execute(session_id)

    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

    return _to_session_response(session, db)


@router.get("/campaign/{campaign_id}", response_model=SessionListResponse)
async def get_campaign_sessions(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    db: Session = Depends(get_db)
):
    """Get all sessions for a campaign"""
    query = GetSessionsByCampaign(session_repo)
    sessions = query.execute(campaign_id)

    return SessionListResponse(
        sessions=[_to_session_response(session, db) for session in sessions],
        total=len(sessions)
    )


@router.put("/{session_id}", response_model=SessionResponse)
async def update_session(
    session_id: UUID,
    request: UpdateSessionRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    db: Session = Depends(get_db)
):
    """Update session details (host only)"""
    try:
        command = UpdateSession(session_repo)
        session = command.execute(
            session_id=session_id,
            host_id=current_user.id,
            name=request.name
        )
        return _to_session_response(session, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_session(
    session_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Delete a session (host only)"""
    try:
        command = DeleteSession(session_repo, campaign_repo)
        command.execute(session_id=session_id, host_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{session_id}/players/{user_id}", response_model=SessionResponse)
async def remove_player_from_session(
    session_id: UUID,
    user_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    db: Session = Depends(get_db)
):
    """Remove a player from the session roster (host only)"""
    try:
        command = RemovePlayerFromSession(session_repo, character_repo)
        session = command.execute(
            session_id=session_id,
            user_id=user_id,
            removed_by=current_user.id
        )
        return _to_session_response(session, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{session_id}/start", response_model=SessionResponse)
async def start_session(
    session_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    Start a session (INACTIVE → ACTIVE).

    This endpoint:
    1. Validates session ownership
    2. Sets session status to STARTING
    3. Calls api-game to create MongoDB active_session
    4. Sets session status to ACTIVE with active_game_id

    Returns session with status='ACTIVE' and active_game_id set.
    Frontend can then redirect to /game?room_id={active_game_id}
    """
    try:
        command = StartSession(session_repo, user_repo, campaign_repo, event_manager)
        session = await command.execute(session_id, current_user.id)
        return _to_session_response(session, db)

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


@router.post("/{session_id}/pause", response_model=SessionResponse)
async def pause_session(
    session_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    Pause a session (ACTIVE → INACTIVE) using fail-safe three-phase pattern.

    This endpoint:
    1. Validates session ownership
    2. Sets session status to STOPPING
    3. PHASE 1: Fetches final state from MongoDB (non-destructive)
    4. PHASE 2: Writes to PostgreSQL (fail-safe - MongoDB preserved on error)
    5. PHASE 3: Background cleanup of MongoDB session
    6. Unlocks all characters that were locked to this session
    7. Broadcasts session_paused event (silent state update) to all campaign members

    Returns session with status='inactive'.
    If PostgreSQL write fails, MongoDB session is preserved and error returned.
    """
    try:
        command = PauseSession(session_repo, user_repo, character_repo, campaign_repo, event_manager)
        session = await command.execute(session_id, current_user.id)
        return _to_session_response(session, db)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error pausing session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to pause session"
        )


@router.post("/{session_id}/finish", response_model=SessionResponse)
async def finish_session(
    session_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    Finish a session permanently (ACTIVE/INACTIVE → FINISHED).

    This endpoint:
    1. If ACTIVE: Performs full ETL (like pause_session) then sets FINISHED
    2. If INACTIVE: Sets FINISHED directly
    3. Unlocks all characters that were locked to this session
    4. FINISHED sessions cannot be resumed and are preserved in campaign history

    Returns session with status='finished'.
    """
    try:
        command = FinishSession(session_repo, user_repo, character_repo, campaign_repo, event_manager)
        session = await command.execute(session_id, current_user.id)
        return _to_session_response(session, db)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error finishing session {session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to finish session"
        )


# === Character Selection Endpoints ===

@router.post("/{session_id}/select-character")
async def select_character_for_session(
    session_id: UUID,
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Select character for a joined session"""
    try:
        command = SelectCharacterForSession(session_repo, character_repo)
        character = command.execute(
            session_id=session_id,
            user_id=current_user.id,
            character_id=character_id
        )
        return {
            "message": "Character selected successfully",
            "character_id": str(character.id),
            "character_name": character.character_name
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{session_id}/change-character")
async def change_character_for_session(
    session_id: UUID,
    old_character_id: UUID,
    new_character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Change character for a session (between play sessions)"""
    try:
        command = ChangeCharacterForSession(session_repo, character_repo)
        character = command.execute(
            session_id=session_id,
            user_id=current_user.id,
            old_character_id=old_character_id,
            new_character_id=new_character_id
        )
        return {
            "message": "Character changed successfully",
            "new_character_id": str(character.id),
            "new_character_name": character.character_name
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.put("/{session_id}/change-character-active")
async def change_character_during_game(
    session_id: UUID,
    new_character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Change character during an active game.

    Unlike change-character, this endpoint:
    - Only works when session is ACTIVE
    - Does not unlock the old character (accumulating locks)
    - Syncs new character data to MongoDB via api-game
    """
    try:
        command = ChangeCharacterDuringGame(session_repo, character_repo, user_repo)
        character = await command.execute(
            session_id=session_id,
            user_id=current_user.id,
            new_character_id=new_character_id
        )
        return {
            "message": "Character changed successfully",
            "new_character_id": str(character.id),
            "new_character_name": character.character_name
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{session_id}/disconnect")
async def disconnect_from_game(
    session_id: UUID,
    character_id: UUID,
    character_state: dict,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    session_repo: SessionRepository = Depends(get_session_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Handle player disconnect from active game (partial ETL)"""
    try:
        command = DisconnectFromGame(session_repo, character_repo)
        character = command.execute(
            session_id=session_id,
            user_id=current_user.id,
            character_id=character_id,
            character_state=character_state
        )
        return {
            "message": "Character state saved successfully",
            "character_id": str(character.id),
            "hp_current": character.hp_current,
            "is_alive": character.is_alive
        }
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
