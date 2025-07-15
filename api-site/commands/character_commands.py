# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from services.character_service import CharacterService
from typing import List
from uuid import UUID

class GetUserCharacters:
    """Command to get all characters for a user"""
    
    def __init__(self, db: Session):
        self.character_service = CharacterService(db)
    
    def execute(self, user_id: UUID) -> List:
        """Execute the command to get user's characters"""
        characters = self.character_service.get_characters_by_user_id(user_id)
        return characters

class CreateCharacter:
    """Command to create a new character"""
    
    def __init__(self, db: Session):
        self.character_service = CharacterService(db)
    
    def execute(self, user_id: UUID, name: str, race: str, character_class: str, level: int = 1):
        """Execute the command to create a character"""
        character = self.character_service.create_character(user_id, name, race, character_class, level)
        return character