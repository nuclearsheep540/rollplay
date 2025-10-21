# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from modules.campaign.model.game_model import Game as GameModel
from modules.user.model.user_model import User
from modules.characters.model.character_model import Character
from modules.game.domain.game_aggregate import GameAggregate, GameStatus


class GameRepository:
    """Repository handling Game aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, game_id: UUID) -> Optional[GameAggregate]:
        """Get game by ID"""
        model = (
            self.db.query(GameModel)
            .filter_by(id=game_id)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_campaign_id(self, campaign_id: UUID) -> List[GameAggregate]:
        """Get all games for a campaign"""
        models = (
            self.db.query(GameModel)
            .filter_by(campaign_id=campaign_id)
            .order_by(GameModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_all(self) -> List[GameAggregate]:
        """Get all games (admin use)"""
        models = self.db.query(GameModel).order_by(GameModel.created_at.desc()).all()
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: GameAggregate) -> UUID:
        """Save game aggregate"""
        if aggregate.id:
            # Update existing
            model = (
                self.db.query(GameModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not model:
                raise ValueError(f"Game {aggregate.id} not found")

            # Update game fields
            model.name = aggregate.name
            model.status = aggregate.status.value
            model.session_id = aggregate.session_id
            model.started_at = aggregate.started_at
            model.stopped_at = aggregate.stopped_at

            # Sync invited_users relationship
            invited_user_models = self.db.query(User).filter(User.id.in_(aggregate.invited_users)).all()
            model.invited_users = invited_user_models

            # Sync player_characters relationship
            character_models = self.db.query(Character).filter(Character.id.in_(aggregate.player_characters)).all()
            model.player_characters = character_models

        else:
            # Create new
            model = GameModel(
                id=aggregate.id,
                name=aggregate.name,
                campaign_id=aggregate.campaign_id,
                dungeon_master_id=aggregate.dungeon_master_id,
                status=aggregate.status.value,
                session_id=aggregate.session_id,
                created_at=aggregate.created_at,
                started_at=aggregate.started_at,
                stopped_at=aggregate.stopped_at
            )
            self.db.add(model)
            self.db.flush()  # Get ID before setting relationships

            # Set invited_users relationship
            if aggregate.invited_users:
                invited_user_models = self.db.query(User).filter(User.id.in_(aggregate.invited_users)).all()
                model.invited_users = invited_user_models

            # Set player_characters relationship
            if aggregate.player_characters:
                character_models = self.db.query(Character).filter(Character.id.in_(aggregate.player_characters)).all()
                model.player_characters = character_models

        self.db.commit()
        self.db.refresh(model)

        if not aggregate.id:
            aggregate.id = model.id

        return model.id

    def delete(self, game_id: UUID) -> bool:
        """Delete game"""
        model = (
            self.db.query(GameModel)
            .filter_by(id=game_id)
            .first()
        )

        if not model:
            return False

        # Business rule validation through aggregate
        game = self._model_to_aggregate(model)
        if not game.can_be_deleted():
            raise ValueError("Cannot delete game - it must be INACTIVE")

        # Delete game (cascade will handle association tables)
        self.db.delete(model)
        self.db.commit()
        return True

    def _model_to_aggregate(self, model: GameModel) -> GameAggregate:
        """Helper to convert game model to aggregate"""
        return GameAggregate(
            id=model.id,
            name=model.name,
            campaign_id=model.campaign_id,
            dungeon_master_id=model.dungeon_master_id,
            status=GameStatus(model.status),
            created_at=model.created_at,
            started_at=model.started_at,
            stopped_at=model.stopped_at,
            session_id=model.session_id,
            invited_users=[user.id for user in model.invited_users],
            player_characters=[char.id for char in model.player_characters]
        )
