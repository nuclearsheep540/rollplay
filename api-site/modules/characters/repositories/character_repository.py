# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

import logging
from typing import List, Optional, Dict
from uuid import UUID
from sqlalchemy.orm import Session, joinedload

from modules.characters.model.character_model import Character as CharacterModel
from modules.characters.model.character_class_model import CharacterClassEntry
from modules.characters.model.character_ability_model import CharacterAbilityScore
from modules.characters.model.dnd_class_model import DndClass
from modules.characters.model.dnd_ability_model import DndAbility
from modules.characters.domain.character_aggregate import (
    CharacterAggregate,
    AbilityScores,
    CharacterRace,
    CharacterClass,
    CharacterClassInfo,
    CharacterBackground
)

logger = logging.getLogger(__name__)


class CharacterRepository:
    """Repository handling Character aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session
        self._class_lookup = None
        self._ability_lookup = None

    def _get_class_lookup(self) -> Dict[str, int]:
        """Lazy-load class name → id mapping"""
        if self._class_lookup is None:
            rows = self.db.query(DndClass).all()
            self._class_lookup = {row.name: row.id for row in rows}
        return self._class_lookup

    def _get_ability_lookup(self) -> Dict[str, int]:
        """Lazy-load ability name → id mapping"""
        if self._ability_lookup is None:
            rows = self.db.query(DndAbility).all()
            self._ability_lookup = {row.name: row.id for row in rows}
        return self._ability_lookup

    def _character_query(self):
        """Base query with eager-loaded join tables"""
        return (
            self.db.query(CharacterModel)
            .options(
                joinedload(CharacterModel.class_entries).joinedload(CharacterClassEntry.dnd_class),
                joinedload(CharacterModel.ability_score_entries).joinedload(CharacterAbilityScore.dnd_ability),
            )
        )

    def _model_to_aggregate(self, model: CharacterModel) -> CharacterAggregate:
        """Helper to convert ORM model → Domain aggregate"""
        # Build ability scores and origin bonuses from the same join table
        scores_dict = {}
        origin_ability_bonuses = {}
        for entry in (model.ability_score_entries or []):
            scores_dict[entry.dnd_ability.name] = entry.score
            if entry.origin_bonus > 0:
                origin_ability_bonuses[entry.dnd_ability.name] = entry.origin_bonus
        ability_scores = AbilityScores.from_dict(scores_dict) if scores_dict else AbilityScores.default()

        # Build character classes from join table
        character_classes = [
            CharacterClassInfo(
                character_class=CharacterClass(entry.dnd_class.name),
                level=entry.level
            )
            for entry in (model.class_entries or [])
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
            origin_ability_bonuses=origin_ability_bonuses or {},
        )

    def get_by_id(self, character_id: UUID) -> Optional[CharacterAggregate]:
        """Get character by ID"""
        model = (
            self._character_query()
            .filter_by(id=character_id, is_deleted=False)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_user_id(self, user_id: UUID) -> List[CharacterAggregate]:
        """Get all characters for a specific user"""
        models = (
            self._character_query()
            .filter_by(user_id=user_id, is_deleted=False)
            .order_by(CharacterModel.updated_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: CharacterAggregate) -> UUID:
        """Save character aggregate with join table sync"""
        class_lookup = self._get_class_lookup()
        ability_lookup = self._get_ability_lookup()

        if aggregate.id:
            # Update existing character
            character_model = (
                self._character_query()
                .filter_by(id=aggregate.id)
                .first()
            )
            if not character_model:
                raise ValueError(f"Character {aggregate.id} not found")

            character_model.user_id = aggregate.user_id
            character_model.character_name = aggregate.character_name
            character_model.character_race = aggregate.character_race.value
            character_model.level = aggregate.level
            character_model.is_deleted = aggregate.is_deleted
            character_model.updated_at = aggregate.updated_at
            character_model.active_campaign = aggregate.active_campaign
            character_model.hp_max = aggregate.hp_max
            character_model.hp_current = aggregate.hp_current
            character_model.ac = aggregate.ac
            character_model.is_alive = aggregate.is_alive
            character_model.background = aggregate.background.value if aggregate.background else None

            # Sync join tables
            self._sync_classes(character_model, aggregate, class_lookup)
            self._sync_ability_scores(character_model, aggregate, ability_lookup)

        else:
            # Create new character
            character_model = CharacterModel(
                user_id=aggregate.user_id,
                character_name=aggregate.character_name,
                character_race=aggregate.character_race.value,
                level=aggregate.level,
                is_deleted=aggregate.is_deleted,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
                active_campaign=aggregate.active_campaign,
                hp_max=aggregate.hp_max,
                hp_current=aggregate.hp_current,
                ac=aggregate.ac,
                is_alive=aggregate.is_alive,
                background=aggregate.background.value if aggregate.background else None,
            )
            self.db.add(character_model)
            self.db.flush()
            aggregate.id = character_model.id

            # Insert class entries
            for class_info in aggregate.character_classes:
                self.db.add(CharacterClassEntry(
                    character_id=character_model.id,
                    class_id=class_lookup[class_info.character_class.value],
                    level=class_info.level
                ))

            # Insert ability score entries (with background bonuses on same row)
            scores = aggregate.ability_scores.to_dict()
            bonuses = aggregate.origin_ability_bonuses or {}
            for ability_name, score in scores.items():
                self.db.add(CharacterAbilityScore(
                    character_id=character_model.id,
                    ability_id=ability_lookup[ability_name],
                    score=score,
                    origin_bonus=bonuses.get(ability_name, 0)
                ))

        self.db.commit()
        self.db.refresh(character_model)
        return character_model.id

    def _sync_classes(self, model: CharacterModel, aggregate: CharacterAggregate, class_lookup: Dict[str, int]) -> None:
        """Diff and sync character_classes join table"""
        desired = {
            class_lookup[ci.character_class.value]: ci.level
            for ci in aggregate.character_classes
        }
        current = {entry.class_id: entry for entry in model.class_entries}

        for class_id, entry in current.items():
            if class_id not in desired:
                self.db.delete(entry)
            elif entry.level != desired[class_id]:
                entry.level = desired[class_id]

        for class_id, level in desired.items():
            if class_id not in current:
                self.db.add(CharacterClassEntry(
                    character_id=model.id,
                    class_id=class_id,
                    level=level
                ))

    def _sync_ability_scores(self, model: CharacterModel, aggregate: CharacterAggregate, ability_lookup: Dict[str, int]) -> None:
        """Diff and sync character_ability_scores join table (scores + background bonuses)"""
        scores = aggregate.ability_scores.to_dict()
        bonuses = aggregate.origin_ability_bonuses or {}
        desired = {
            ability_lookup[name]: (scores[name], bonuses.get(name, 0))
            for name in scores
        }
        current = {entry.ability_id: entry for entry in model.ability_score_entries}

        for ability_id, entry in current.items():
            if ability_id not in desired:
                self.db.delete(entry)
            else:
                desired_score, desired_bonus = desired[ability_id]
                if entry.score != desired_score:
                    entry.score = desired_score
                if entry.origin_bonus != desired_bonus:
                    entry.origin_bonus = desired_bonus

        for ability_id, (score, bonus) in desired.items():
            if ability_id not in current:
                self.db.add(CharacterAbilityScore(
                    character_id=model.id,
                    ability_id=ability_id,
                    score=score,
                    origin_bonus=bonus
                ))

    def delete(self, character_id: UUID) -> bool:
        """Soft delete character"""
        character_model = (
            self._character_query()
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
            self._character_query()
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
            self._character_query()
            .filter(
                CharacterModel.user_id == user_id,
                CharacterModel.active_campaign == campaign_id,
                CharacterModel.is_deleted == False
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None
