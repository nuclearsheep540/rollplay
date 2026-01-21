# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from modules.session.repositories.session_repository import SessionRepository
from modules.session.domain.session_aggregate import SessionEntity


class GetSessionById:
    """Get a session by ID"""

    def __init__(self, session_repository: SessionRepository):
        self.session_repo = session_repository

    def execute(self, session_id: UUID) -> Optional[SessionEntity]:
        """Get session by ID"""
        return self.session_repo.get_by_id(session_id)


class GetSessionsByCampaign:
    """Get all sessions for a campaign"""

    def __init__(self, session_repository: SessionRepository):
        self.session_repo = session_repository

    def execute(self, campaign_id: UUID) -> List[SessionEntity]:
        """Get all sessions for a campaign"""
        return self.session_repo.get_by_campaign_id(campaign_id)


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
        self.session_repo = session_repository

    def execute(self, user_id: UUID) -> List[SessionEntity]:
        """
        Get all sessions where user is either:
        - The host (DM)
        - A joined player (in joined_users)
        """
        all_sessions = self.session_repo.get_all()
        user_sessions = []

        for session in all_sessions:
            # Include if user is host
            if session.host_id == user_id:
                user_sessions.append(session)
            # Include if user has joined
            elif session.has_user(user_id):
                user_sessions.append(session)

        return user_sessions
