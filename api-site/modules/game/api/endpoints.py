# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from uuid import UUID
import logging

from fastapi import APIRouter, Depends, HTTPException, status

from modules.game.api.schemas import (
    DisconnectRequest,
    EndGameRequest,
    GameResponse,
    StartGameRequest,
    UpdateGameRequest,
)
from modules.game.application.commands import (
    DisconnectFromGame,
    EndGame,
    StartGame,
    UpdateGame,
)
from modules.game.domain.game_aggregate import EndReason
from modules.game.dependencies.providers import get_game_repository
from modules.game.repositories.game_repository import GameRepository
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
from modules.events.event_manager import EventManager
from modules.events.dependencies.providers import get_event_manager
from shared.dependencies.auth import get_current_user_id
from shared.services.s3_service import S3Service, get_s3_service

logger = logging.getLogger(__name__)

router = APIRouter(tags=["games"])


# === Service-to-service ===
#
# Declared first so its literal path is matched before any /{game_id} pattern.
# The /internal prefix is returned 404 at the nginx edge (mirrors
# /api/users/internal/*), so this is reachable only across the Docker network —
# which is what lets it take a user id in the body instead of a JWT.

@router.post("/internal/{game_id}/disconnect", status_code=status.HTTP_204_NO_CONTENT)
async def disconnect_from_game(
    game_id: UUID,
    request: DisconnectRequest,
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Save one player's character state as they leave a running game.

    Called by api-game when a socket closes. Their runtime state goes to their
    own character row, not to the game and not to the session's party.
    """
    try:
        command = DisconnectFromGame(game_repo, character_repo)
        command.execute(
            game_id=game_id,
            user_id=request.user_id,
            character_id=request.character_id,
            character_state=request.character_state
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# === Game lifecycle ===

@router.post("/", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def start_game(
    request: StartGameRequest,
    user_id: UUID = Depends(get_current_user_id),
    game_repo: GameRepository = Depends(get_game_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo: CharacterRepository = Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    asset_repo: MediaAssetRepository = Depends(get_asset_repository),
    event_manager: EventManager = Depends(get_event_manager),
    s3_service: S3Service = Depends(get_s3_service)
):
    """
    Start a game for the session (host only).

    This endpoint:
    1. Validates the session's host and that nothing is already running
    2. Mints the game row — its id is the room id
    3. Seeds the room from the session's newest ended game + the campaign baseline
    4. Generates fresh presigned URLs for the campaign's assets (parallel)
    5. Calls api-game to create the MongoDB room
    6. Marks the game ACTIVE and takes the planned name off the session

    Returns the new game, whose id the client uses as `room_id`.
    """
    try:
        command = StartGame(
            game_repo, session_repo, user_repo, character_repo,
            campaign_repo, event_manager, asset_repo, s3_service
        )
        game = await command.execute(request.session_id, user_id)
        return GameResponse.model_validate(game)

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error starting a game for session {request.session_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to start the game"
        )


@router.post("/{game_id}/end", status_code=status.HTTP_204_NO_CONTENT)
async def end_game(
    game_id: UUID,
    request: EndGameRequest,
    user_id: UUID = Depends(get_current_user_id),
    game_repo: GameRepository = Depends(get_game_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo=Depends(get_character_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    event_manager: EventManager = Depends(get_event_manager),
    asset_repo: MediaAssetRepository = Depends(get_asset_repository)
):
    """
    End the running game (ACTIVE → ENDED) using the fail-safe three-phase pattern.

    The session survives, and so does everything the party built: the game keeps
    the board, the log and what was on screen, and the next game seeds from it.
    Optionally records what the night was called and what happened.

    This endpoint:
    1. Validates the game's host and status
    2. Sets the game to ENDING
    3. PHASE 1: Fetches final state from MongoDB (non-destructive)
    4. PHASE 2: Writes it to PostgreSQL (fail-safe — MongoDB preserved on error)
    5. PHASE 3: Background cleanup of the MongoDB room
    6. Broadcasts session_ended to every campaign member except the host
    """
    try:
        command = EndGame(
            game_repo, session_repo, user_repo, character_repo,
            campaign_repo, event_manager, asset_repo
        )
        await command.execute(
            game_id, user_id, reason=EndReason.HOST,
            name=request.name, summary=request.summary
        )

    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected error ending game {game_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to end the game"
        )


@router.patch("/{game_id}", response_model=GameResponse)
async def update_game(
    game_id: UUID,
    request: UpdateGameRequest,
    user_id: UUID = Depends(get_current_user_id),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """Rename a game or rewrite its summary (host only, any status)."""
    try:
        command = UpdateGame(game_repo)
        game = command.execute(
            game_id=game_id,
            host_id=user_id,
            name=request.name,
            summary=request.summary
        )
        return GameResponse.model_validate(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
