# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import text

from modules.campaign.model.game_model import Game as GameModel
from modules.user.model.user_model import User
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
            model.max_players = aggregate.max_players

            # Sync invited_users relationship
            invited_user_models = self.db.query(User).filter(User.id.in_(aggregate.invited_users)).all()
            model.invited_users = invited_user_models

            # Sync joined_users (game_joined_users table)
            self._sync_joined_users(model.id, aggregate.joined_users)

        else:
            # Create new
            model = GameModel(
                id=aggregate.id,
                name=aggregate.name,
                campaign_id=aggregate.campaign_id,
                host_id=aggregate.host_id,
                status=aggregate.status.value,
                session_id=aggregate.session_id,
                created_at=aggregate.created_at,
                started_at=aggregate.started_at,
                stopped_at=aggregate.stopped_at,
                max_players=aggregate.max_players
            )
            self.db.add(model)
            self.db.flush()  # Get ID before setting relationships

            # Set invited_users relationship
            if aggregate.invited_users:
                invited_user_models = self.db.query(User).filter(User.id.in_(aggregate.invited_users)).all()
                model.invited_users = invited_user_models

            # Set joined_users (game_joined_users table)
            if aggregate.joined_users:
                self._sync_joined_users(model.id, aggregate.joined_users)

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

    def _sync_joined_users(self, game_id: UUID, joined_user_ids: List[UUID]) -> None:
        """
        Sync joined_users list with game_joined_users table.
        This maintains the roster of users who have accepted invites.
        """
        # Get current joined users
        current_joined = self.db.execute(
            text("SELECT user_id FROM game_joined_users WHERE game_id = :game_id"),
            {"game_id": game_id}
        ).fetchall()
        # Convert to UUID objects if they're strings (SQLite compatibility)
        current_user_ids = {UUID(row[0]) if isinstance(row[0], str) else row[0] for row in current_joined}
        target_user_ids = set(joined_user_ids)

        # Add new joined users
        to_add = target_user_ids - current_user_ids
        for user_id in to_add:
            self.db.execute(
                text("INSERT INTO game_joined_users (game_id, user_id) VALUES (:game_id, :user_id)"),
                {"game_id": game_id, "user_id": user_id}
            )

        # Remove users who left
        to_remove = current_user_ids - target_user_ids
        for user_id in to_remove:
            self.db.execute(
                text("DELETE FROM game_joined_users WHERE game_id = :game_id AND user_id = :user_id"),
                {"game_id": game_id, "user_id": user_id}
            )

    def _model_to_aggregate(self, model: GameModel) -> GameAggregate:
        """Helper to convert game model to aggregate"""
        # Fetch joined_users from game_joined_users table
        joined_users_result = self.db.execute(
            text("SELECT user_id FROM game_joined_users WHERE game_id = :game_id"),
            {"game_id": model.id}
        ).fetchall()
        # Convert to UUID objects if they're strings (SQLite compatibility)
        joined_user_ids = [UUID(row[0]) if isinstance(row[0], str) else row[0] for row in joined_users_result]

        return GameAggregate(
            id=model.id,
            name=model.name,
            campaign_id=model.campaign_id,
            host_id=model.host_id,
            status=GameStatus(model.status),
            created_at=model.created_at,
            started_at=model.started_at,
            stopped_at=model.stopped_at,
            session_id=model.session_id,
            invited_users=[user.id for user in model.invited_users],
            joined_users=joined_user_ids,
            max_players=model.max_players
        )
