# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID
import logging
from fastapi import APIRouter, Depends, HTTPException, status

logger = logging.getLogger(__name__)

from modules.game.schemas.game_schemas import (
    CreateGameRequest,
    UpdateGameRequest,
    GameResponse,
    GameListResponse,
    RosterPlayerResponse
)
from modules.game.application.commands import (
    CreateGame,
    StartGame,
    EndGame,
    FinishGame,
    RemovePlayerFromGame,
    UpdateGame,
    DeleteGame,
    SelectCharacterForGame,
    ChangeCharacterForGame,
    ChangeCharacterDuringSession,
    DisconnectFromSession
)
from modules.game.application.queries import (
    GetGameById,
    GetGamesByCampaign,
    GetUserGames
)
from modules.game.dependencies.repositories import get_game_repository
from modules.game.repositories.game_repository import GameRepository
from modules.user.orm.user_repository import UserRepository
from modules.user.dependencies.providers import user_repository as get_user_repository
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.dependencies.providers import get_character_repository
from modules.campaign.orm.campaign_repository import CampaignRepository
from modules.campaign.dependencies.providers import campaign_repository
from modules.user.domain.user_aggregate import UserAggregate
from modules.game.domain.game_aggregate import GameAggregate
from shared.dependencies.auth import get_current_user_from_token
from shared.dependencies.db import get_db
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager
from sqlalchemy.orm import Session


router = APIRouter(tags=["games"])


def _to_game_response(game: GameAggregate, db: Session) -> GameResponse:
    """Convert GameAggregate to GameResponse with enriched roster data"""
    from modules.campaign.model.game_model import GameJoinedUser
    from modules.user.model.user_model import User
    from modules.characters.model.character_model import Character

    # Fetch host/DM information
    host_user = db.query(User).filter(User.id == game.host_id).first()
    host_name = host_user.screen_name or host_user.email if host_user else "Unknown"

    # Fetch roster data with character and user information
    roster_data = []
    roster_query = db.query(
        GameJoinedUser,
        User,
        Character
    ).join(
        User, GameJoinedUser.user_id == User.id
    ).outerjoin(
        Character, GameJoinedUser.selected_character_id == Character.id
    ).filter(
        GameJoinedUser.game_id == game.id
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

    return GameResponse(
        id=game.id,
        name=game.name,
        campaign_id=game.campaign_id,
        host_id=game.host_id,
        host_name=host_name,
        status=game.status.value,
        created_at=game.created_at,
        started_at=game.started_at,
        stopped_at=game.stopped_at,
        session_id=game.session_id,
        joined_users=game.joined_users,
        roster=roster_data,
        player_count=game.get_player_count(),
        max_players=game.max_players
    )


@router.get("/my-games", response_model=GameListResponse)
async def get_my_games(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    db: Session = Depends(get_db)
):
    """Get all games where user is host or invited player"""
    query = GetUserGames(game_repo)
    games = query.execute(current_user.id)

    return GameListResponse(
        games=[_to_game_response(game, db) for game in games],
        total=len(games)
    )


@router.get("/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    db: Session = Depends(get_db)
):
    """Get game by ID"""
    query = GetGameById(game_repo)
    game = query.execute(game_id)

    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    return _to_game_response(game, db)


@router.get("/campaign/{campaign_id}", response_model=GameListResponse)
async def get_campaign_games(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    db: Session = Depends(get_db)
):
    """Get all games for a campaign"""
    query = GetGamesByCampaign(game_repo)
    games = query.execute(campaign_id)

    return GameListResponse(
        games=[_to_game_response(game, db) for game in games],
        total=len(games)
    )


@router.put("/{game_id}", response_model=GameResponse)
async def update_game(
    game_id: UUID,
    request: UpdateGameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    db: Session = Depends(get_db)
):
    """Update game details (host only)"""
    try:
        command = UpdateGame(game_repo)
        game = command.execute(
            game_id=game_id,
            host_id=current_user.id,
            name=request.name
        )
        return _to_game_response(game, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Delete a game (host only)"""
    try:
        command = DeleteGame(game_repo, campaign_repo)
        command.execute(game_id=game_id, host_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{game_id}/players/{user_id}", response_model=GameResponse)
async def remove_player_from_game(
    game_id: UUID,
    user_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    db: Session = Depends(get_db)
):
    """Remove a player from the game roster (host only)"""
    try:
        command = RemovePlayerFromGame(game_repo, character_repo)
        game = command.execute(
            game_id=game_id,
            user_id=user_id,
            removed_by=current_user.id
        )
        return _to_game_response(game, db)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{game_id}/start", response_model=GameResponse)
async def start_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    Start a game session (INACTIVE → ACTIVE).

    This endpoint:
    1. Validates game ownership
    2. Sets game status to STARTING
    3. Calls api-game to create MongoDB active_session
    4. Sets game status to ACTIVE with session_id

    Returns game with status='ACTIVE' and session_id set.
    Frontend can then redirect to /game?room_id={session_id}
    """
    try:
        command = StartGame(game_repo, user_repo, campaign_repo, event_manager)
        game = await command.execute(game_id, current_user.id)
        return _to_game_response(game, db)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error starting game {game_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start game"
        )


@router.post("/{game_id}/end", response_model=GameResponse)
async def end_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    End a game session (ACTIVE → INACTIVE) using fail-safe three-phase pattern.

    This endpoint:
    1. Validates game ownership
    2. Sets game status to STOPPING
    3. PHASE 1: Fetches final state from MongoDB (non-destructive)
    4. PHASE 2: Writes to PostgreSQL (fail-safe - MongoDB preserved on error)
    5. PHASE 3: Background cleanup of MongoDB session
    6. Unlocks all characters that were locked to this game
    7. Broadcasts game_ended event (silent state update) to all campaign members

    Returns game with status='inactive'.
    If PostgreSQL write fails, MongoDB session is preserved and error returned.
    """
    try:
        command = EndGame(game_repo, user_repo, character_repo, campaign_repo, event_manager)
        game = await command.execute(game_id, current_user.id)
        return _to_game_response(game, db)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error ending game {game_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to end game"
        )


@router.post("/{game_id}/finish", response_model=GameResponse)
async def finish_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    db: Session = Depends(get_db)
):
    """
    Finish a game session permanently (ACTIVE/INACTIVE → FINISHED).

    This endpoint:
    1. If ACTIVE: Performs full ETL (like end_game) then sets FINISHED
    2. If INACTIVE: Sets FINISHED directly
    3. Unlocks all characters that were locked to this game
    4. FINISHED games cannot be resumed and are preserved in campaign history

    Returns game with status='finished'.
    """
    try:
        command = FinishGame(game_repo, user_repo, character_repo, campaign_repo, event_manager)
        game = await command.execute(game_id, current_user.id)
        return _to_game_response(game, db)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
    except Exception as e:
        logger.error(f"Unexpected error finishing game {game_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to finish game"
        )


# === Character Selection Endpoints ===

@router.post("/{game_id}/select-character")
async def select_character_for_game(
    game_id: UUID,
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Select character for a joined game"""
    try:
        command = SelectCharacterForGame(game_repo, character_repo)
        character = command.execute(
            game_id=game_id,
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


@router.put("/{game_id}/change-character")
async def change_character_for_game(
    game_id: UUID,
    old_character_id: UUID,
    new_character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Change character for a game (between sessions)"""
    try:
        command = ChangeCharacterForGame(game_repo, character_repo)
        character = command.execute(
            game_id=game_id,
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


@router.put("/{game_id}/change-character-active")
async def change_character_during_session(
    game_id: UUID,
    new_character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """
    Change character during an active session.

    Unlike change-character, this endpoint:
    - Only works when game is ACTIVE
    - Does not unlock the old character (accumulating locks)
    - Syncs new character data to MongoDB via api-game
    """
    try:
        command = ChangeCharacterDuringSession(game_repo, character_repo, user_repo)
        character = await command.execute(
            game_id=game_id,
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


@router.post("/{game_id}/disconnect")
async def disconnect_from_session(
    game_id: UUID,
    character_id: UUID,
    character_state: dict,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Handle player disconnect from active session (partial ETL)"""
    try:
        command = DisconnectFromSession(game_repo, character_repo)
        character = command.execute(
            game_id=game_id,
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