# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from .schemas import (
    CharacterCreateRequest,
    CharacterResponse
)
from modules.characters.dependencies.providers import get_character_repository
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.application.commands import CreateCharacter, DeleteCharacter
from modules.characters.application.queries import GetCharactersByUser, GetCharacterById
from shared.dependencies.auth import get_current_user_from_token
from modules.user.domain.user_aggregate import UserAggregate
from modules.characters.domain.character_aggregate import CharacterAggregate

router = APIRouter()


def _to_character_response(character: CharacterAggregate) -> CharacterResponse:
    """Helper to convert CharacterAggregate to CharacterResponse"""
    return CharacterResponse(
        id=str(character.id),
        user_id=str(character.user_id),
        character_name=character.character_name,
        character_class=character.character_class,
        character_race=character.character_race,
        level=character.level,
        stats=character.stats,
        created_at=character.created_at,
        updated_at=character.updated_at,
        display_name=character.get_display_name()
    )


@router.post("/create", response_model=CharacterResponse)
async def create_character(
    request: CharacterCreateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Create a new character"""
    try:
        command = CreateCharacter(character_repo)
        character = command.execute(
            user_id=current_user.id,
            character_name=request.name,
            character_class=request.character_class,
            character_race=request.character_race,
            level=request.level,
            stats=request.stats
        )

        return _to_character_response(character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[CharacterResponse])
async def get_user_characters(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Get all characters for the current user"""
    try:
        query = GetCharactersByUser(character_repo)
        characters = query.execute(current_user.id)

        return [_to_character_response(character) for character in characters]

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Get character by ID"""
    try:
        query = GetCharacterById(character_repo)
        character = query.execute(character_id)

        if not character:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found"
            )

        # Business rule: Only character owner can view details
        if not character.is_owned_by(current_user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied - only character owner can view details"
            )

        return _to_character_response(character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{character_id}")
async def delete_character(
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Delete character (soft delete)"""
    try:
        command = DeleteCharacter(character_repo)
        success = command.execute(character_id, current_user.id)

        if success:
            return {"message": "Character deleted successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found"
            )

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )
