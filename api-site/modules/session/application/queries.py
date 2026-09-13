# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy import or_
from sqlalchemy.orm import Session as DbSession, selectinload

from modules.game.api.schemas import GameResponse
from modules.game.repositories.game_repository import GameRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.session.api.schemas import SessionResponse, RosterPlayerResponse
from modules.session.model.session_model import Session as SessionModel, SessionJoinedUser
from modules.user.model.user_model import User
from modules.characters.model.character_model import Character


# How many past games ride along on a session response. The campaign drawer
# lists them, and a GM who plays weekly for a year has fifty — all of which the
# dashboard would otherwise fetch, serialise and send on every read, for every
# campaign they are in. The count travels separately so nothing is hidden: the
# drawer can say "showing 5 of 50" and, when someone asks to see the rest, they
# come from a route built for paging rather than from this one growing.
RECENT_GAMES_ON_A_SESSION = 5


def _build_response(db: DbSession, model: SessionModel) -> SessionResponse:
    """
    Build an enriched SessionResponse from a session ORM model.

    Performs cross-aggregate reads to resolve host display name, roster details
    (user names, character info), and the session's games — the open one, which
    is what "live" means, and the most recent ended ones, which are its history.
    """
    game_repo = GameRepository(db)
    open_game = game_repo.get_open_game_for_session(model.id)
    played_games = game_repo.get_ended_games_for_session(
        model.id, limit=RECENT_GAMES_ON_A_SESSION
    )
    games_played = game_repo.count_ended_games_for_session(model.id)
    # Resolve host display name
    host_user = db.query(User).filter(User.id == model.host_id).first()
    host_name = host_user.screen_name or host_user.email if host_user else "Unknown"

    # The roster is users. The party is characters, and a character's session_id IS its
    # party membership — so this is one left join on that column, not a pointer lookup.
    roster_query = db.query(SessionJoinedUser, User).join(
        User, SessionJoinedUser.user_id == User.id
    ).filter(
        SessionJoinedUser.session_id == model.id
    ).all()

    party_by_user_id = {
        character.user_id: character
        for character in db.query(Character).filter(
            Character.session_id == model.id,
            Character.is_deleted == False,  # noqa: E712
        ).all()
    }

    roster = []
    joined_user_ids = []
    for joined_user, user in roster_query:
        joined_user_ids.append(user.id)
        character = party_by_user_id.get(user.id)
        roster.append(RosterPlayerResponse(
            user_id=user.id,
            username=user.screen_name or user.email,
            character_id=character.id if character else None,
            display_name=character.display_name if character else None,
            is_alive=character.is_alive if character else None,
            joined_at=joined_user.joined_at
        ))

    return SessionResponse(
        id=model.id,
        campaign_id=model.campaign_id,
        campaign_name=model.campaign.title if model.campaign else None,
        host_id=model.host_id,
        host_name=host_name,
        created_at=model.created_at,
        scheduled_at=model.scheduled_at,
        next_game_name=model.next_game_name,
        game=GameResponse.model_validate(open_game) if open_game else None,
        games=[GameResponse.model_validate(game) for game in played_games],
        games_played=games_played,
        joined_users=joined_user_ids,
        roster=roster,
        player_count=len(joined_user_ids)
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
