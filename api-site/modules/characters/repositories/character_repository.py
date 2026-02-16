# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from modules.characters.model.character_model import Character as CharacterModel
from modules.characters.domain.character_aggregate import (
    CharacterAggregate,
    AbilityScores,
    CharacterRace,
    CharacterClass,
    CharacterClassInfo,
    CharacterBackground
)


class CharacterRepository:
    """Repository handling Character aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def _model_to_aggregate(self, model: CharacterModel) -> CharacterAggregate:
        """Helper to convert ORM model → Domain aggregate"""
        ability_scores = AbilityScores.from_dict(model.stats or {})

        # Deserialize JSONB character_classes array → List[CharacterClassInfo]
        # Format: [{"class": "Fighter", "level": 5}, {"class": "Rogue", "level": 3}]
        character_classes = [
            CharacterClassInfo(
                character_class=CharacterClass(class_data['class']),
                level=class_data['level']
            )
            for class_data in (model.character_classes or [])
        ]

        return CharacterAggregate(
            id=model.id,
            user_id=model.user_id,
            character_name=model.character_name,
            character_classes=character_classes,
            character_race=CharacterRace(model.character_race),
            level=model.level,
            ability_scores=ability_scores,
            created_at=model.created_at,
            updated_at=model.updated_at,
            is_deleted=model.is_deleted,
            active_campaign=model.active_campaign,
            hp_current=model.hp_current,
            hp_max=model.hp_max,
            ac=model.ac,
            is_alive=model.is_alive,
            background=CharacterBackground(model.background) if model.background else None,
            origin_ability_bonuses=model.origin_ability_bonuses,
        )

    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        model = (
            self.db.query(CharacterModel)
            .filter_by(id=character_id, is_deleted=False)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a specific user"""
        models = (
            self.db.query(CharacterModel)
            .filter_by(user_id=user_id, is_deleted=False)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: CharacterAggregate) -> UUID:
        """Save character aggregate"""
        # Serialize List[CharacterClassInfo] → JSONB array
        # Format: [{"class": "Fighter", "level": 5}, {"class": "Rogue", "level": 3}]
        character_classes_jsonb = [
            {
                'class': class_info.character_class.value,
                'level': class_info.level
            }
            for class_info in aggregate.character_classes
        ]

        if aggregate.id:
            # Update existing character
            character_model = (
                self.db.query(CharacterModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not character_model:
                raise ValueError(f"Character {aggregate.id} not found")

            character_model.user_id = aggregate.user_id
            character_model.character_name = aggregate.character_name
            character_model.character_classes = character_classes_jsonb
            character_model.character_race = aggregate.character_race.value
            character_model.level = aggregate.level
            character_model.stats = aggregate.ability_scores.to_dict()
            character_model.is_deleted = aggregate.is_deleted
            character_model.updated_at = aggregate.updated_at
            character_model.active_campaign = aggregate.active_campaign
            character_model.hp_max = aggregate.hp_max
            character_model.hp_current = aggregate.hp_current
            character_model.ac = aggregate.ac
            character_model.is_alive = aggregate.is_alive
            character_model.background = aggregate.background.value if aggregate.background else None
            character_model.origin_ability_bonuses = aggregate.origin_ability_bonuses

        else:
            # Create new character
            character_model = CharacterModel(
                user_id=aggregate.user_id,
                character_name=aggregate.character_name,
                character_classes=character_classes_jsonb,
                character_race=aggregate.character_race.value,
                level=aggregate.level,
                stats=aggregate.ability_scores.to_dict(),
                is_deleted=aggregate.is_deleted,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
                active_campaign=aggregate.active_campaign,
                hp_max=aggregate.hp_max,
                hp_current=aggregate.hp_current,
                ac=aggregate.ac,
                is_alive=aggregate.is_alive,
                background=aggregate.background.value if aggregate.background else None,
                origin_ability_bonuses=aggregate.origin_ability_bonuses
            )
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

        # Convert to aggregate for business rule validation
        character = self._model_to_aggregate(character_model)

        if not character.can_be_deleted():
            raise ValueError("Cannot delete character - it is locked to an active campaign")

        # Soft delete
        character.soft_delete()
        character_model.is_deleted = character.is_deleted
        self.db.commit()
        return True

    def get_by_active_campaign(self, campaign_id: UUID) -> List[CharacterAggregate]:
        """
        Get all characters locked to a specific campaign.

        Used when unlocking characters after players leave campaign.
        """
        models = (
            self.db.query(CharacterModel)
            .filter(CharacterModel.active_campaign == campaign_id)
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_user_character_for_campaign(self, user_id: UUID, campaign_id: UUID) -> Optional[CharacterAggregate]:
        """
        Get the character a user has locked to a specific campaign.

        Returns None if user has no character locked to this campaign.
        """
        model = (
            self.db.query(CharacterModel)
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.active_campaign == campaign_id,
                CharacterModel.is_deleted == False
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None

