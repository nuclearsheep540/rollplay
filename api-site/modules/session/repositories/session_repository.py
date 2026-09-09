# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Repository - Data access layer for the Session aggregate

Ubiquitous Language:
- Session = the campaign's table: who plays and when (this repository)
- Game = one play, hot in api-game while it runs (modules/game)

There are no status queries here. "Is this campaign live" is a question about
games, and GameRepository answers it.
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session as DbSession
from sqlalchemy import text

from modules.session.model.session_model import Session as SessionModel, SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity


class SessionRepository:
    """Repository handling Session aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: DbSession):
        self.db = db_session

    def get_by_id(self, session_id: UUID) -> Optional[SessionEntity]:
        """Get session by ID"""
        model = (
            self.db.query(SessionModel)
            .filter_by(id=session_id)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_campaign_id(self, campaign_id: UUID) -> List[SessionEntity]:
        """Get all sessions for a campaign"""
        models = (
            self.db.query(SessionModel)
            .filter_by(campaign_id=campaign_id)
            .order_by(SessionModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_all(self) -> List[SessionEntity]:
        """Get all sessions (admin use)"""
        models = self.db.query(SessionModel).order_by(SessionModel.created_at.desc()).all()
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: SessionEntity) -> UUID:
        """Save session aggregate"""
        if aggregate.id:
            # Update existing
            model = (
                self.db.query(SessionModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not model:
                raise ValueError(f"Session {aggregate.id} not found")

            # Update session fields
            model.scheduled_at = aggregate.scheduled_at
            model.next_game_name = aggregate.next_game_name

            # Sync joined_users (session_joined_users table)
            self._sync_joined_users(model.id, aggregate.joined_users)

        else:
            # Create new
            model = SessionModel(
                id=aggregate.id,
                campaign_id=aggregate.campaign_id,
                host_id=aggregate.host_id,
                created_at=aggregate.created_at,
                scheduled_at=aggregate.scheduled_at,
                next_game_name=aggregate.next_game_name,
            )
            self.db.add(model)
            self.db.flush()  # Get ID before setting relationships

            # Set joined_users (session_joined_users table)
            if aggregate.joined_users:
                self._sync_joined_users(model.id, aggregate.joined_users)

        self.db.commit()
        self.db.refresh(model)

        if not aggregate.id:
            aggregate.id = model.id

        return model.id

    def _sync_joined_users(self, session_id: UUID, joined_user_ids: List[UUID]) -> None:
        """
        Sync joined_users list with session_joined_users table.
        This maintains the roster of users who have accepted invites.
        """
        # Get current joined users
        current_joined = self.db.execute(
            text("SELECT user_id FROM session_joined_users WHERE session_id = :session_id"),
            {"session_id": session_id}
        ).fetchall()
        # Convert to UUID objects if they're strings (SQLite compatibility)
        current_user_ids = {UUID(row[0]) if isinstance(row[0], str) else row[0] for row in current_joined}
        target_user_ids = set(joined_user_ids)

        # Add new joined users
        to_add = target_user_ids - current_user_ids
        for user_id in to_add:
            self.db.execute(
                text("INSERT INTO session_joined_users (session_id, user_id) VALUES (:session_id, :user_id)"),
                {"session_id": session_id, "user_id": user_id}
            )

        # Remove users who left
        to_remove = current_user_ids - target_user_ids
        for user_id in to_remove:
            self.db.execute(
                text("DELETE FROM session_joined_users WHERE session_id = :session_id AND user_id = :user_id"),
                {"session_id": session_id, "user_id": user_id}
            )

    def _model_to_aggregate(self, model: SessionModel) -> SessionEntity:
        """Helper to convert session model to aggregate"""
        # Fetch joined_users from session_joined_users table
        joined_users_result = self.db.execute(
            text("SELECT user_id FROM session_joined_users WHERE session_id = :session_id"),
            {"session_id": model.id}
        ).fetchall()
        # Convert to UUID objects if they're strings (SQLite compatibility)
        joined_user_ids = [UUID(row[0]) if isinstance(row[0], str) else row[0] for row in joined_users_result]

        return SessionEntity(
            id=model.id,
            campaign_id=model.campaign_id,
            host_id=model.host_id,
            created_at=model.created_at,
            scheduled_at=model.scheduled_at,
            next_game_name=model.next_game_name,
            joined_users=joined_user_ids,
        )
