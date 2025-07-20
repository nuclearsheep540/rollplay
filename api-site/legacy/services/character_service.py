# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from sqlalchemy.orm import Session
from models.character import Character
from typing import List, Optional
from uuid import UUID

class CharacterService:
    """Service for character data operations"""
    
    def __init__(self, db: Session):
        self.db = db
    
    def get_characters_by_user_id(self, user_id: UUID) -> List[Character]:
        """Get all characters for a specific user"""
        return self.db.query(Character).filter(Character.user_id == user_id).all()
    
    def get_character_by_id(self, character_id: UUID) -> Optional[Character]:
        """Get a specific character by ID"""
        return self.db.query(Character).filter(Character.id == character_id).first()
    
    def create_character(self, user_id: UUID, name: str, race: str, character_class: str, level: int = 1) -> Character:
        """Create a new character"""
        new_character = Character(
            user_id=user_id,
            name=name,
            race=race,
            character_class=character_class,
            level=level
        )
        self.db.add(new_character)
        self.db.commit()
        self.db.refresh(new_character)
        return new_character