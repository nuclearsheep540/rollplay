# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Session Repository - Data access layer for Session aggregate

Ubiquitous Language:
- Session = The scheduled/planned play instance (this repository)
- Game = The live multiplayer experience (handled by api-game service)
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session as DbSession
from sqlalchemy import text

from modules.campaign.model.session_model import Session as SessionModel, SessionJoinedUser
from modules.session.domain.session_aggregate import SessionEntity, SessionStatus


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
            model.name = aggregate.name
            model.status = aggregate.status.value
            model.active_game_id = aggregate.active_game_id
            model.started_at = aggregate.started_at
            model.stopped_at = aggregate.stopped_at
            model.max_players = aggregate.max_players
            model.audio_config = aggregate.audio_config
            model.map_config = aggregate.map_config

            # Sync joined_users (session_joined_users table)
            self._sync_joined_users(model.id, aggregate.joined_users)

        else:
            # Create new
            model = SessionModel(
                id=aggregate.id,
                name=aggregate.name,
                campaign_id=aggregate.campaign_id,
                host_id=aggregate.host_id,
                status=aggregate.status.value,
                active_game_id=aggregate.active_game_id,
                created_at=aggregate.created_at,
                started_at=aggregate.started_at,
                stopped_at=aggregate.stopped_at,
                max_players=aggregate.max_players,
                audio_config=aggregate.audio_config,
                map_config=aggregate.map_config
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

    def delete(self, session_id: UUID) -> bool:
        """Delete session using SQLAlchemy ORM"""
        model = (
            self.db.query(SessionModel)
            .filter_by(id=session_id)
            .first()
        )

        if not model:
            return False

        # Business rule validation through aggregate
        session = self._model_to_aggregate(model)
        if not session.can_delete():
            raise ValueError("Cannot delete session - it must be INACTIVE or FINISHED")

        # Explicitly delete child records using SQLAlchemy ORM to avoid relationship conflicts
        # Delete SessionJoinedUser records (prevents ORM trying to SET NULL on primary key)
        self.db.query(SessionJoinedUser).filter_by(session_id=session_id).delete(synchronize_session=False)

        # Now safe to delete the session
        self.db.delete(model)
        self.db.commit()
        return True

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
            name=model.name,
            campaign_id=model.campaign_id,
            host_id=model.host_id,
            status=SessionStatus(model.status),
            created_at=model.created_at,
            started_at=model.started_at,
            stopped_at=model.stopped_at,
            active_game_id=model.active_game_id,
            joined_users=joined_user_ids,
            max_players=model.max_players,
            audio_config=model.audio_config,
            map_config=model.map_config
        )
