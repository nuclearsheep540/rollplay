# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from fastapi import APIRouter, Depends, HTTPException, status
from typing import List
from uuid import UUID

from .schemas import (
    CharacterCreateRequest,
    UpdateAbilityScoresRequest,
    CharacterResponse,
    CharacterClassInfoResponse
)
from modules.characters.dependencies.providers import get_character_repository
from modules.characters.orm.character_repository import CharacterRepository
from modules.characters.application.commands import CreateCharacter, UpdateCharacter, UpdateAbilityScores, DeleteCharacter, CloneCharacter
from modules.characters.application.queries import GetCharactersByUser, GetCharacterById
from shared.dependencies.auth import get_current_user_id
from modules.characters.domain.character_aggregate import (
    CharacterAggregate,
    AbilityScores,
    CharacterClassInfo
)

router = APIRouter()


def _to_character_response(character: CharacterAggregate) -> CharacterResponse:
    """Helper to convert CharacterAggregate to CharacterResponse"""
    # Convert List[CharacterClassInfo] → List[CharacterClassInfoResponse]
    character_classes_response = [
        CharacterClassInfoResponse(
            character_class=class_info.character_class.value,  # Enum → string
            level=class_info.level
        )
        for class_info in character.character_classes
    ]

    return CharacterResponse(
        id=str(character.id),
        user_id=str(character.user_id),
        character_name=character.character_name,
        character_classes=character_classes_response,  # List of classes
        character_race=character.character_race.value,    # Enum → string
        background=character.background.value if character.background else None,  # D&D 2024
        level=character.level,  # Total character level
        ability_scores=character.ability_scores.to_dict(),  # AbilityScores → dict
        origin_ability_bonuses=character.origin_ability_bonuses,  # D&D 2024
        created_at=character.created_at,
        updated_at=character.updated_at,
        display_name=character.get_display_name(),  # Formatted with all classes
        hp_max=character.hp_max,
        hp_current=character.hp_current,
        ac=character.ac,
        active_campaign=str(character.active_campaign) if character.active_campaign else None
    )


@router.post("/create", response_model=CharacterResponse)
async def create_character(
    request: CharacterCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Create a new character with multi-class support"""
    try:
        # Convert Pydantic → Domain value objects

        # Convert character_classes list
        character_classes = [
            CharacterClassInfo(
                character_class=class_req.character_class,
                level=class_req.level
            )
            for class_req in request.character_classes
        ]

        # Convert ability scores
        ability_scores = None
        if request.ability_scores:
            ability_scores = AbilityScores(
                strength=request.ability_scores.strength,
                dexterity=request.ability_scores.dexterity,
                constitution=request.ability_scores.constitution,
                intelligence=request.ability_scores.intelligence,
                wisdom=request.ability_scores.wisdom,
                charisma=request.ability_scores.charisma
            )

        command = CreateCharacter(character_repo)
        character = command.execute(
            user_id=user_id,
            character_name=request.name,
            character_classes=character_classes,  # List of classes
            character_race=request.character_race,
            background=request.background,  # D&D 2024
            level=request.level,
            ability_scores=ability_scores,
            origin_ability_bonuses=request.origin_ability_bonuses,  # D&D 2024
            hp_current=request.hp_current,
            hp_max=request.hp_max,
            ac=request.ac
        )

        return _to_character_response(character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/", response_model=List[CharacterResponse])
async def get_user_characters(
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Get all characters for the current user"""
    try:
        query = GetCharactersByUser(character_repo)
        characters = query.execute(user_id)

        return [_to_character_response(character) for character in characters]

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.get("/{character_id}", response_model=CharacterResponse)
async def get_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
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
        if not character.is_owned_by(user_id):
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


@router.put("/{character_id}", response_model=CharacterResponse)
async def update_character(
    character_id: UUID,
    request: CharacterCreateRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Update an existing character (full update) with multi-class support"""
    try:
        # Convert Pydantic → Domain value objects

        # Convert character_classes list
        character_classes = [
            CharacterClassInfo(
                character_class=class_req.character_class,
                level=class_req.level
            )
            for class_req in request.character_classes
        ]

        # Convert ability scores
        ability_scores = None
        if request.ability_scores:
            ability_scores = AbilityScores(
                strength=request.ability_scores.strength,
                dexterity=request.ability_scores.dexterity,
                constitution=request.ability_scores.constitution,
                intelligence=request.ability_scores.intelligence,
                wisdom=request.ability_scores.wisdom,
                charisma=request.ability_scores.charisma
            )
        else:
            # If no ability scores provided, use defaults
            ability_scores = AbilityScores.default()

        command = UpdateCharacter(character_repo)
        character = command.execute(
            character_id=character_id,
            user_id=user_id,
            character_name=request.name,
            character_classes=character_classes,  # List of classes
            character_race=request.character_race,
            level=request.level,
            ability_scores=ability_scores,
            hp_max=request.hp_max,
            hp_current=request.hp_current,
            ac=request.ac,
            background=request.background,
            origin_ability_bonuses=request.origin_ability_bonuses
        )

        return _to_character_response(character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.patch("/{character_id}/ability_scores", response_model=CharacterResponse)
async def update_character_ability_scores(
    character_id: UUID,
    request: UpdateAbilityScoresRequest,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Update character ability scores (partial update supported)"""
    try:
        # Get current character
        character = character_repo.get_by_id(character_id)
        if not character:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Character not found"
            )

        # Only update fields that were provided
        updates = request.model_dump(exclude_unset=True)
        if not updates:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No ability scores provided"
            )

        # Use update_score() for partial update
        new_scores = character.ability_scores.update_score(**updates)

        # Execute command
        command = UpdateAbilityScores(character_repo)
        character = command.execute(character_id, user_id, new_scores)

        return _to_character_response(character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.post("/{character_id}/clone", response_model=CharacterResponse)
async def clone_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Clone an existing character - creates a new copy with '(Copy)' appended to name"""
    try:
        command = CloneCharacter(character_repo)
        cloned_character = command.execute(character_id, user_id)
        return _to_character_response(cloned_character)

    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(e)
        )


@router.delete("/{character_id}")
async def delete_character(
    character_id: UUID,
    user_id: UUID = Depends(get_current_user_id),
    character_repo: CharacterRepository = Depends(get_character_repository)
):
    """Delete character (soft delete)"""
    try:
        command = DeleteCharacter(character_repo)
        success = command.execute(character_id, user_id)

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
