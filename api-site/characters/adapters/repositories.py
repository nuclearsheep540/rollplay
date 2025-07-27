# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from characters.orm.character_model import Character as CharacterModel
from characters.domain.aggregates import CharacterAggregate
from characters.adapters.mappers import to_domain, from_domain, update_model_from_domain


class CharacterRepository:
    """Repository handling Character aggregate persistence"""
    
    def __init__(self, db_session: Session):
        self.db = db_session
    
    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id, is_deleted=False)
            .first()
        )
        return to_domain(model) if model else None
    
    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a specific user"""
        models = (
            self.db.query(CharacterModel)
            .filter_by(user_id=user_id, is_deleted=False)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [to_domain(model) for model in models]
    
    def get_by_name(self, user_id: UUID, name: str) -> Optional[CharacterAggregate]:
        """Get character by name for a specific user (for uniqueness checks)"""
        model = (
            self.db.query(CharacterModel)
            .filter_by(user_id=user_id, name=name, is_deleted=False)
            .first()
        )
        return to_domain(model) if model else None
    
    def save(self, aggregate: CharacterAggregate) -> UUID:
        """Save character aggregate"""
        if aggregate.id:
            # Update existing character
            character_model = (
                self.db.query(CharacterModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not character_model:
                raise ValueError(f"Character {aggregate.id} not found")
            
            update_model_from_domain(character_model, aggregate)
            
        else:
            # Create new character
            character_model = from_domain(aggregate)
            self.db.add(character_model)
            
            # Flush to get the ID before committing
            self.db.flush()
            aggregate.id = character_model.id
        
        self.db.commit()
        self.db.refresh(character_model)
        return character_model.id
    
    def delete(self, character_id: UUID) -> bool:
        """Soft delete character"""
        character_model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id)
            .first()
        )
        
        if not character_model:
            return False
        
        # Business rule validation through aggregate
        character = to_domain(character_model)
        if not character.can_be_deleted():
            raise ValueError("Cannot delete character - it may be in an active game")
        
        # Soft delete
        character.soft_delete()
        update_model_from_domain(character_model, character)
        self.db.commit()
        return True
    
    def restore(self, character_id: UUID) -> bool:
        """Restore a soft-deleted character"""
        character_model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id, is_deleted=True)
            .first()
        )
        
        if not character_model:
            return False
        
        character = to_domain(character_model)
        character.restore()
        update_model_from_domain(character_model, character)
        self.db.commit()
        return True
    
    def get_deleted_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all soft-deleted characters for a user (for potential restoration)"""
        models = (
            self.db.query(CharacterModel)
            .filter_by(user_id=user_id, is_deleted=True)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [to_domain(model) for model in models]