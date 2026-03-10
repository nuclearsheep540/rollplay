# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession, selectinload

from modules.session.repositories.session_repository import SessionRepository
from modules.session.api.schemas import SessionResponse, RosterPlayerResponse
from modules.campaign.model.session_model import Session as SessionModel, SessionJoinedUser
from modules.user.model.user_model import User
from modules.characters.model.character_model import Character
from modules.characters.model.character_class_model import CharacterClassEntry


def _build_response(db: DbSession, model: SessionModel) -> SessionResponse:
    """
    Build an enriched SessionResponse from a session ORM model.

    Performs cross-aggregate reads to resolve host display name and
    roster details (user names, character info) for frontend display.
    """
    # Resolve host display name
    host_user = db.query(User).filter(User.id == model.host_id).first()
    host_name = host_user.screen_name or host_user.email if host_user else "Unknown"

    # Build roster with character details via cross-table join
    roster_query = db.query(
        SessionJoinedUser, User, Character
    ).join(
        User, SessionJoinedUser.user_id == User.id
    ).outerjoin(
        Character, SessionJoinedUser.selected_character_id == Character.id
    ).options(
        selectinload(Character.class_entries).joinedload(CharacterClassEntry.dnd_class)
    ).filter(
        SessionJoinedUser.session_id == model.id
    ).all()

    roster = []
    joined_user_ids = []
    for joined_user, user, character in roster_query:
        joined_user_ids.append(user.id)
        character_class_str = None
        if character and character.class_entries:
            character_class_str = ' / '.join(
                [entry.dnd_class.name for entry in character.class_entries]
            )
        roster.append(RosterPlayerResponse(
            user_id=user.id,
            username=user.screen_name or user.email,
            character_id=character.id if character else None,
            character_name=character.character_name if character else None,
            character_level=character.level if character else None,
            character_class=character_class_str,
            character_race=character.character_race if character else None,
            joined_at=joined_user.joined_at
        ))

    return SessionResponse(
        id=model.id,
        name=model.name,
        campaign_id=model.campaign_id,
        host_id=model.host_id,
        host_name=host_name,
        status=model.status,
        created_at=model.created_at,
        started_at=model.started_at,
        stopped_at=model.stopped_at,
        active_game_id=model.active_game_id,
        joined_users=joined_user_ids,
        roster=roster,
        player_count=len(joined_user_ids),
        max_players=model.max_players
    )


class GetSessionById:
    """Get a session by ID with enriched roster and host data"""

    def __init__(self, session_repository: SessionRepository):
        self.db = session_repository.db

    def execute(self, session_id: UUID) -> Optional[SessionResponse]:
        model = self.db.query(SessionModel).filter_by(id=session_id).first()
        if not model:
            return None
        return _build_response(self.db, model)


class GetSessionsByCampaign:
    """Get all sessions for a campaign with enriched data"""

    def __init__(self, session_repository: SessionRepository):
        self.db = session_repository.db

    def execute(self, campaign_id: UUID) -> List[SessionResponse]:
        models = (
            self.db.query(SessionModel)
            .filter_by(campaign_id=campaign_id)
            .order_by(SessionModel.created_at.desc())
            .all()
        )
        return [_build_response(self.db, model) for model in models]


class GetSessionPlayers:
    """Get list of user IDs who have joined a session"""

    def __init__(self, session_repository: SessionRepository):
        self.session_repo = session_repository

    def execute(self, session_id: UUID) -> List[UUID]:
        """Get user IDs for players who have joined the session roster"""
        session = self.session_repo.get_by_id(session_id)
        if not session:
            raise ValueError(f"Session {session_id} not found")
        return session.joined_users


class GetUserSessions:
    """Get all sessions where user is host or joined"""

    def __init__(self, session_repository: SessionRepository):
        self.db = session_repository.db

    def execute(self, user_id: UUID) -> List[SessionResponse]:
        """
        Get all sessions where user is either the host or a joined player.
        Uses SQL filtering instead of loading all sessions into memory.
        """
        joined_subquery = (
            self.db.query(SessionJoinedUser.session_id)
            .filter(SessionJoinedUser.user_id == user_id)
            .subquery()
        )
        models = (
            self.db.query(SessionModel)
            .filter(
                or_(
                    SessionModel.host_id == user_id,
                    SessionModel.id.in_(joined_subquery)
                )
            )
            .order_by(SessionModel.created_at.desc())
            .all()
        )
        return [_build_response(self.db, model) for model in models]
