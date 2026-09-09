# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Game Repository - Data access layer for the Game aggregate

Two queries carry most of the weight here:

- get_open_game_for_session / _for_campaign answer "is this live", which is what
  the session used to answer with a status column. Liveness is derived, so that
  every caller reads the same fact from the same place.
- get_newest_ended_game_for_session is the continuity link: the game a new game
  seeds from.
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from sqlalchemy.orm import Session as DbSession

from modules.game.domain.game_aggregate import GameAggregate, GameStatus
from modules.game.model.game_model import Game as GameModel


class GameRepository:
    """Repository handling Game aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: DbSession):
        self.db = db_session

    def get_by_id(self, game_id: UUID) -> Optional[GameAggregate]:
        """Get a game by id."""
        model = self.db.query(GameModel).filter_by(id=game_id).first()
        return self._model_to_aggregate(model) if model else None

    def get_open_game_for_session(self, session_id: UUID) -> Optional[GameAggregate]:
        """The session's open game, or None when nothing is running.

        "Open" spans STARTING, ACTIVE and ENDING — the whole time a room exists
        or is being built or torn down. A partial unique index guarantees at most
        one, so `.first()` is the answer rather than a sample.
        """
        model = (
            self.db.query(GameModel)
            .filter(
                GameModel.session_id == session_id,
                GameModel.status != GameStatus.ENDED.value,
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def get_open_game_for_campaign(self, campaign_id: UUID) -> Optional[GameAggregate]:
        """The campaign's open game, or None — "is this campaign live".

        Reads the denormalised campaign_id so callers across the campaign,
        library and user modules need no session join.
        """
        model = (
            self.db.query(GameModel)
            .filter(
                GameModel.campaign_id == campaign_id,
                GameModel.status != GameStatus.ENDED.value,
            )
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def get_newest_ended_game_for_session(self, session_id: UUID) -> Optional[GameAggregate]:
        """The game a new game seeds from, or None for a session's first game.

        Ordered by ended_at rather than created_at: it is the state left most
        recently that continuity means, and only ended games have any.
        """
        model = (
            self.db.query(GameModel)
            .filter(
                GameModel.session_id == session_id,
                GameModel.status == GameStatus.ENDED.value,
            )
            .order_by(GameModel.ended_at.desc().nulls_last(), GameModel.created_at.desc())
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def get_newest_ended_game_for_campaign(self, campaign_id: UUID) -> Optional[GameAggregate]:
        """The last game played in this campaign, whichever session it belonged to.

        A campaign has one session today, so this is that session's newest ended
        game. Going through the campaign lets callers who only hold a campaign id
        (the library's asset guards) ask without a session lookup.
        """
        model = (
            self.db.query(GameModel)
            .filter(
                GameModel.campaign_id == campaign_id,
                GameModel.status == GameStatus.ENDED.value,
            )
            .order_by(GameModel.ended_at.desc().nulls_last(), GameModel.created_at.desc())
            .first()
        )
        return self._model_to_aggregate(model) if model else None

    def get_ended_games_for_session(
        self, session_id: UUID, limit: Optional[int] = None
    ) -> List[GameAggregate]:
        """Games played at this session, newest first — the drawer's history.

        `limit` caps the rows returned. Every session response carries this
        list, and a campaign gains a game per evening for its whole life, so an
        uncapped read grows without bound on the dashboard's hottest query.
        Pass None only where the caller genuinely needs all of them.
        """
        query = (
            self.db.query(GameModel)
            .filter(
                GameModel.session_id == session_id,
                GameModel.status == GameStatus.ENDED.value,
            )
            .order_by(GameModel.ended_at.desc().nulls_last(), GameModel.created_at.desc())
        )
        if limit is not None:
            query = query.limit(limit)
        return [self._model_to_aggregate(model) for model in query.all()]

    def count_ended_games_for_session(self, session_id: UUID) -> int:
        """How many games have been played here, however many are returned.

        The drawer shows a capped list but says the true total, so "3 of 47"
        is expressible without loading forty-seven rows.
        """
        return (
            self.db.query(GameModel)
            .filter(
                GameModel.session_id == session_id,
                GameModel.status == GameStatus.ENDED.value,
            )
            .count()
        )

    def get_open_games(self) -> List[GameAggregate]:
        """Every open game — the admin command's work list.

        started_at is stamped by activate(), but PostgreSQL sorts NULLs first
        under DESC, so nulls_last() keeps a STARTING game from floating above
        the running ones.
        """
        models = (
            self.db.query(GameModel)
            .filter(GameModel.status != GameStatus.ENDED.value)
            .order_by(GameModel.started_at.desc().nulls_last(), GameModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_ending_games(self) -> List[GameAggregate]:
        """Games stranded mid-take-down — the boot reconciler's work list.

        ENDING is transient by design; a row still holding it when no ETL is in
        flight means a process death interrupted an End.
        """
        models = (
            self.db.query(GameModel)
            .filter(GameModel.status == GameStatus.ENDING.value)
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_expired_open_games(self, now: datetime) -> List[GameAggregate]:
        """ACTIVE games whose signed-URL lease has lapsed — the sweeper's work list."""
        models = (
            self.db.query(GameModel)
            .filter(
                GameModel.status == GameStatus.ACTIVE.value,
                GameModel.urls_expire_at.isnot(None),
                GameModel.urls_expire_at <= now,
            )
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: GameAggregate) -> UUID:
        """Insert or update, mapping every column including the state of play."""
        if aggregate.id:
            model = self.db.query(GameModel).filter_by(id=aggregate.id).first()
            if not model:
                raise ValueError(f"Game {aggregate.id} not found")

            model.status = aggregate.status.value
            model.name = aggregate.name
            model.started_at = aggregate.started_at
            model.ended_at = aggregate.ended_at
            model.ended_by = aggregate.ended_by.value if aggregate.ended_by else None
            model.urls_expire_at = aggregate.urls_expire_at
            model.summary = aggregate.summary
            model.attendance = [attendee.to_dict() for attendee in aggregate.attendance]
            model.map_token_seed = aggregate.map_token_seed
            model.map_token_state = aggregate.map_token_state
            model.adventure_log = aggregate.adventure_log
            model.map_config = aggregate.map_config
            model.image_config = aggregate.image_config
            model.active_display = aggregate.active_display
            model.audio_config = aggregate.audio_config
            model.spotify_config = aggregate.spotify_config
        else:
            model = GameModel(
                id=aggregate.id,
                session_id=aggregate.session_id,
                campaign_id=aggregate.campaign_id,
                host_id=aggregate.host_id,
                status=aggregate.status.value,
                name=aggregate.name,
                created_at=aggregate.created_at,
                started_at=aggregate.started_at,
                ended_at=aggregate.ended_at,
                ended_by=aggregate.ended_by.value if aggregate.ended_by else None,
                urls_expire_at=aggregate.urls_expire_at,
                summary=aggregate.summary,
                attendance=[attendee.to_dict() for attendee in aggregate.attendance],
                map_token_seed=aggregate.map_token_seed,
                map_token_state=aggregate.map_token_state,
                adventure_log=aggregate.adventure_log,
                map_config=aggregate.map_config,
                image_config=aggregate.image_config,
                active_display=aggregate.active_display,
                audio_config=aggregate.audio_config,
                spotify_config=aggregate.spotify_config,
            )
            self.db.add(model)
            self.db.flush()

        # SQLAlchemy leaves a session UNUSABLE after a failed commit — every
        # later statement on it raises PendingRollbackError until someone rolls
        # back. StartGame's error path is a real caller of that: it deletes the
        # STARTING row it just failed to activate, and without this the delete
        # raised too, leaving a phantom row that blocks the session's next start
        # through the one-open-game index. Rolling back here keeps the failure
        # the caller sees the ORIGINAL one, and hands them a usable session.
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise

        self.db.refresh(model)

        if not aggregate.id:
            aggregate.id = model.id

        return model.id

    def delete(self, game_id: UUID) -> bool:
        """Remove a game row.

        Only ever called by StartGame's rollback: a game that never reached
        ACTIVE is not a game that happened, and leaving it would put a phantom
        in the history and a wrong answer under "newest ended game".
        """
        model = self.db.query(GameModel).filter_by(id=game_id).first()
        if not model:
            return False

        self.db.delete(model)
        # Same contract as save(): a failed commit must not leave the session
        # poisoned for whatever the caller does next.
        try:
            self.db.commit()
        except Exception:
            self.db.rollback()
            raise
        return True

    def _model_to_aggregate(self, model: GameModel) -> GameAggregate:
        """Convert a row to the aggregate. No mapper module — this is the seam."""
        return GameAggregate.from_persistence(
            id=model.id,
            session_id=model.session_id,
            campaign_id=model.campaign_id,
            host_id=model.host_id,
            status=model.status,
            name=model.name,
            created_at=model.created_at,
            started_at=model.started_at,
            ended_at=model.ended_at,
            ended_by=model.ended_by,
            urls_expire_at=model.urls_expire_at,
            summary=model.summary,
            attendance=model.attendance,
            map_token_seed=model.map_token_seed,
            map_token_state=model.map_token_state,
            adventure_log=model.adventure_log,
            map_config=model.map_config,
            image_config=model.image_config,
            active_display=model.active_display,
            audio_config=model.audio_config,
            spotify_config=model.spotify_config,
        )
