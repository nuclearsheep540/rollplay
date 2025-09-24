# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from characters.schemas.character_schemas import (
    CharacterCreateRequest,
    CharacterUpdateRequest,
    CharacterStatsUpdateRequest,
    CharacterResponse,
    CharacterSummaryResponse
)
from characters.dependencies.repositories import get_character_repository
from characters.adapters.repositories import CharacterRepository
from characters.application.commands import (
    CreateCharacter,
    GetUserCharacters,
    GetCharacterById,
    UpdateCharacter,
    UpdateCharacterStats,
    LevelUpCharacter,
    LevelDownCharacter,
    DeleteCharacter,
    RestoreCharacter,
    GetDeletedCharacters
)
from shared.dependencies.auth import get_current_user_from_token
from user.domain.aggregates import UserAggregate

router = APIRouter()


# Character endpoints
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
            name=request.name,
            character_class=request.character_class,
            character_race=request.character_race,
            level=request.level,
            stats=request.stats
        )
        
        return CharacterResponse.from_aggregate(character)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[CharacterSummaryResponse])
async def get_user_characters(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Get all characters for the current user"""
    try:
        command = GetUserCharacters(character_repo)
        characters = command.execute(current_user.id)
        
        return [CharacterSummaryResponse.from_aggregate(character) for character in characters]
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/deleted", response_model=List[CharacterSummaryResponse])
async def get_deleted_characters(
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Get all soft-deleted characters for the current user"""
    try:
        command = GetDeletedCharacters(character_repo)
        characters = command.execute(current_user.id)
        
        return [CharacterSummaryResponse.from_aggregate(character) for character in characters]
        
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
        command = GetCharacterById(character_repo)
        character = command.execute(character_id)
        
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
        
        return CharacterResponse.from_aggregate(character)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: UUID,
    request: CharacterUpdateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Update character details"""
    try:
        command = UpdateCharacter(character_repo)
        character = command.execute(
            character_id=character_id,
            user_id=current_user.id,
            name=request.name,
            character_class=request.character_class,
            level=request.level
        )
        
        return CharacterResponse.from_aggregate(character)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.put("/{character_id}/stats", response_model=CharacterResponse)
async def update_character_stats(
    character_id: UUID,
    request: CharacterStatsUpdateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Update character stats/sheet data"""
    try:
        command = UpdateCharacterStats(character_repo)
        character = command.execute(
            character_id=character_id,
            user_id=current_user.id,
            stats=request.stats
        )
        
        return CharacterResponse.from_aggregate(character)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/{character_id}/level-up", response_model=CharacterResponse)
async def level_up_character(
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Level up a character"""
    try:
        command = LevelUpCharacter(character_repo)
        character = command.execute(character_id, current_user.id)
        
        return CharacterResponse.from_aggregate(character)
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/{character_id}/level-down", response_model=CharacterResponse)
async def level_down_character(
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Level down a character (for corrections)"""
    try:
        command = LevelDownCharacter(character_repo)
        character = command.execute(character_id, current_user.id)
        
        return CharacterResponse.from_aggregate(character)
        
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


@router.post("/{character_id}/restore")
async def restore_character(
    character_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Restore a soft-deleted character"""
    try:
        command = RestoreCharacter(character_repo)
        success = command.execute(character_id, current_user.id)
        
        if success:
            return {"message": "Character restored successfully"}
        else:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found or not deleted"
            )
            
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )