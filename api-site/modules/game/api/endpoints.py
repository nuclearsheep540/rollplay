# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status

from modules.game.schemas.game_schemas import (
    CreateGameRequest,
    UpdateGameRequest,
    InviteUserRequest,
    AcceptInviteRequest,
    GameResponse,
    GameListResponse
)
from modules.game.application.commands import (
    CreateGame,
    InviteUserToGame,
    AcceptGameInvite,
    DeclineGameInvite,
    RemovePlayerFromGame,
    UpdateGame,
    DeleteGame
)
from modules.game.application.queries import (
    GetGameById,
    GetGamesByCampaign,
    GetUserPendingInvites
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


router = APIRouter(tags=["games"])


def _to_game_response(game: GameAggregate) -> GameResponse:
    """Convert GameAggregate to GameResponse"""
    return GameResponse(
        id=game.id,
        name=game.name,
        campaign_id=game.campaign_id,
        dungeon_master_id=game.dungeon_master_id,
        status=game.status.value,
        created_at=game.created_at,
        started_at=game.started_at,
        stopped_at=game.stopped_at,
        session_id=game.session_id,
        invited_users=game.invited_users,
        player_characters=game.player_characters,
        pending_invites_count=game.get_pending_invites_count(),
        player_count=game.get_player_count()
    )


@router.post("/", response_model=GameResponse, status_code=status.HTTP_201_CREATED)
async def create_game(
    request: CreateGameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Create a new game within a campaign"""
    try:
        command = CreateGame(game_repo, campaign_repo)
        game = command.execute(
            name=request.name,
            campaign_id=request.campaign_id,
            dm_id=current_user.id
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.get("/{game_id}", response_model=GameResponse)
async def get_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """Get game by ID"""
    query = GetGameById(game_repo)
    game = query.execute(game_id)

    if not game:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Game not found")

    return _to_game_response(game)


@router.get("/campaign/{campaign_id}", response_model=GameListResponse)
async def get_campaign_games(
    campaign_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """Get all games for a campaign"""
    query = GetGamesByCampaign(game_repo)
    games = query.execute(campaign_id)

    return GameListResponse(
        games=[_to_game_response(game) for game in games],
        total=len(games)
    )


@router.get("/invites/pending", response_model=GameListResponse)
async def get_my_pending_invites(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """Get all games where current user has pending invites"""
    query = GetUserPendingInvites(game_repo)
    games = query.execute(current_user.id)

    return GameListResponse(
        games=[_to_game_response(game) for game in games],
        total=len(games)
    )


@router.put("/{game_id}", response_model=GameResponse)
async def update_game(
    game_id: UUID,
    request: UpdateGameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository)
):
    """Update game details (DM only)"""
    try:
        command = UpdateGame(game_repo)
        game = command.execute(
            game_id=game_id,
            dm_id=current_user.id,
            name=request.name
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{game_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_game(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository)
):
    """Delete a game (DM only)"""
    try:
        command = DeleteGame(game_repo, campaign_repo)
        command.execute(game_id=game_id, dm_id=current_user.id)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


# === Invite Management Endpoints ===

@router.post("/{game_id}/invites", response_model=GameResponse)
async def invite_user_to_game(
    game_id: UUID,
    request: InviteUserRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Invite a user to join the game (DM only)"""
    try:
        command = InviteUserToGame(game_repo, user_repo)
        game = command.execute(
            game_id=game_id,
            user_id=request.user_id,
            invited_by=current_user.id
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.post("/{game_id}/invites/accept", response_model=GameResponse)
async def accept_game_invite(
    game_id: UUID,
    request: AcceptInviteRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Accept game invite by selecting a character"""
    try:
        command = AcceptGameInvite(game_repo, user_repo, character_repo)
        game = command.execute(
            game_id=game_id,
            user_id=current_user.id,
            character_id=request.character_id
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{game_id}/invites", response_model=GameResponse)
async def decline_game_invite(
    game_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    user_repo: UserRepository = Depends(get_user_repository)
):
    """Decline a game invite"""
    try:
        command = DeclineGameInvite(game_repo, user_repo)
        game = command.execute(
            game_id=game_id,
            user_id=current_user.id
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))


@router.delete("/{game_id}/players/{character_id}", response_model=GameResponse)
async def remove_player_from_game(
    game_id: UUID,
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    game_repo: GameRepository = Depends(get_game_repository),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Remove a player character from the game (DM only)"""
    try:
        command = RemovePlayerFromGame(game_repo, character_repo)
        game = command.execute(
            game_id=game_id,
            character_id=character_id,
            removed_by=current_user.id
        )
        return _to_game_response(game)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))
