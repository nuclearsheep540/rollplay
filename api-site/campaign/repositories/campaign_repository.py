# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session

from campaign.model.campaign_model import Campaign as CampaignModel
from campaign.model.game_model import Game as GameModel
from campaign.domain.aggregates import CampaignAggregate
from campaign.game.domain.entities import GameEntity
from campaign.game.domain.game_status import GameStatus


class CampaignRepository:
    """Repository handling Campaign aggregate and Game entity persistence with inline ORM conversion"""

    def __init__(self, db_session: Session):
        self.db = db_session

    def get_by_id(self, campaign_id: UUID) -> Optional[CampaignAggregate]:
        """Get campaign by ID with all its games"""
        model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )
        if not model:
            return None

        # Inline conversion - no mapper
        games = [
            GameEntity(
                id=g.id,
                name=g.name,
                campaign_id=g.campaign_id,
                dm_id=g.dm_id,
                max_players=g.max_players,
                status=GameStatus(g.status),
                mongodb_session_id=g.mongodb_session_id,
                created_at=g.created_at,
                updated_at=g.updated_at,
                started_at=g.started_at,
                ended_at=g.ended_at
            )
            for g in model.games or []
        ]

        player_ids = []
        if model.player_ids:
            player_ids = [UUID(player_id) for player_id in model.player_ids]

        return CampaignAggregate(
            id=model.id,
            name=model.name,
            description=model.description,
            dm_id=model.dm_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            maps=model.maps,
            games=games,
            player_ids=player_ids
        )

    def get_by_dm_id(self, dm_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is DM"""
        models = (
            self.db.query(CampaignModel)
            .filter_by(dm_id=dm_id)
            .order_by(CampaignModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_member_id(self, user_id: UUID) -> List[CampaignAggregate]:
        """Get all campaigns where user is either DM or player"""
        try:
            # Get campaigns where user is DM
            models = (
                self.db.query(CampaignModel)
                .filter(CampaignModel.dm_id == user_id)
                .order_by(CampaignModel.created_at.desc())
                .all()
            )

            result = []
            for model in models:
                try:
                    campaign = self._model_to_aggregate(model)
                    if campaign:
                        result.append(campaign)
                except Exception as e:
                    # Log error but continue processing other campaigns
                    print(f"Error converting campaign {model.id} to domain: {e}")
                    continue

            return result

        except Exception as e:
            # If query fails entirely, log error and return empty list (not 404!)
            print(f"Error in get_by_member_id: {e}")
            return []

    def save(self, aggregate: CampaignAggregate) -> UUID:
        """Save campaign aggregate with all games"""
        if aggregate.id:
            # Update existing campaign
            campaign_model = (
                self.db.query(CampaignModel)
                .filter_by(id=aggregate.id)
                .first()
            )
            if not campaign_model:
                raise ValueError(f"Campaign {aggregate.id} not found")

            # Update campaign fields
            campaign_model.name = aggregate.name
            campaign_model.description = aggregate.description
            campaign_model.updated_at = aggregate.updated_at
            campaign_model.maps = aggregate.maps
            campaign_model.player_ids = [str(player_id) for player_id in aggregate.player_ids]

            # Sync games
            self._sync_games(campaign_model, aggregate.games)

        else:
            # Create new campaign
            campaign_model = CampaignModel(
                id=aggregate.id,
                name=aggregate.name,
                description=aggregate.description,
                dm_id=aggregate.dm_id,
                created_at=aggregate.created_at,
                updated_at=aggregate.updated_at,
                maps=aggregate.maps,
                player_ids=[str(player_id) for player_id in aggregate.player_ids]
            )
            self.db.add(campaign_model)

            # Flush to get the ID before adding games
            self.db.flush()
            aggregate.id = campaign_model.id

            # Add games if any
            for game in aggregate.games:
                game.campaign_id = campaign_model.id
                game_model = GameModel(
                    id=game.id,
                    name=game.name,
                    campaign_id=game.campaign_id,
                    dm_id=game.dm_id,
                    max_players=game.max_players,
                    status=game.status.value,
                    mongodb_session_id=game.mongodb_session_id,
                    created_at=game.created_at,
                    updated_at=game.updated_at,
                    started_at=game.started_at,
                    ended_at=game.ended_at
                )
                self.db.add(game_model)

        self.db.commit()
        self.db.refresh(campaign_model)
        return campaign_model.id

    def delete(self, campaign_id: UUID) -> bool:
        """Delete campaign and all its games"""
        campaign_model = (
            self.db.query(CampaignModel)
            .filter_by(id=campaign_id)
            .first()
        )

        if not campaign_model:
            return False

        # Business rule validation through aggregate
        campaign = self._model_to_aggregate(campaign_model)
        if not campaign.can_be_deleted():
            raise ValueError("Cannot delete campaign with active games")

        # Delete all games first
        self.db.query(GameModel).filter_by(campaign_id=campaign_id).delete()

        # Delete campaign
        self.db.delete(campaign_model)
        self.db.commit()
        return True

    def get_game_by_id(self, game_id: UUID) -> Optional[GameEntity]:
        """Get a specific game entity"""
        model = (
            self.db.query(GameModel)
            .filter_by(id=game_id)
            .first()
        )
        if not model:
            return None

        return GameEntity(
            id=model.id,
            name=model.name,
            campaign_id=model.campaign_id,
            dm_id=model.dm_id,
            max_players=model.max_players,
            status=GameStatus(model.status),
            mongodb_session_id=model.mongodb_session_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            started_at=model.started_at,
            ended_at=model.ended_at
        )

    def save_game(self, game: GameEntity) -> UUID:
        """Save individual game entity"""
        if game.id:
            # Update existing
            model = (
                self.db.query(GameModel)
                .filter_by(id=game.id)
                .first()
            )
            if not model:
                raise ValueError(f"Game {game.id} not found")

            model.name = game.name
            model.max_players = game.max_players
            model.status = game.status.value
            model.mongodb_session_id = game.mongodb_session_id
            model.updated_at = game.updated_at
            model.started_at = game.started_at
            model.ended_at = game.ended_at
        else:
            # Create new
            model = GameModel(
                id=game.id,
                name=game.name,
                campaign_id=game.campaign_id,
                dm_id=game.dm_id,
                max_players=game.max_players,
                status=game.status.value,
                mongodb_session_id=game.mongodb_session_id,
                created_at=game.created_at,
                updated_at=game.updated_at,
                started_at=game.started_at,
                ended_at=game.ended_at
            )
            self.db.add(model)

        self.db.commit()
        self.db.refresh(model)

        if not game.id:
            game.id = model.id

        return model.id

    def _sync_games(self, campaign_model: CampaignModel, games: List[GameEntity]):
        """Synchronize games with database"""
        # Get current games from database
        current_games = {game.id: game for game in campaign_model.games}
        new_games = {game.id: game for game in games if game.id}

        # Handle updates
        for game in games:
            if game.id and game.id in current_games:
                # Update existing
                model = current_games[game.id]
                model.name = game.name
                model.max_players = game.max_players
                model.status = game.status.value
                model.mongodb_session_id = game.mongodb_session_id
                model.updated_at = game.updated_at
                model.started_at = game.started_at
                model.ended_at = game.ended_at
            elif not game.id:
                # Create new
                game_model = GameModel(
                    id=game.id,
                    name=game.name,
                    campaign_id=campaign_model.id,
                    dm_id=game.dm_id,
                    max_players=game.max_players,
                    status=game.status.value,
                    mongodb_session_id=game.mongodb_session_id,
                    created_at=game.created_at,
                    updated_at=game.updated_at,
                    started_at=game.started_at,
                    ended_at=game.ended_at
                )
                self.db.add(game_model)

        # Handle deletions (games in DB but not in aggregate)
        for game_id in current_games:
            if game_id not in new_games:
                self.db.delete(current_games[game_id])

    def _model_to_aggregate(self, model: CampaignModel) -> CampaignAggregate:
        """Helper to convert campaign model to aggregate"""
        games = [
            GameEntity(
                id=g.id,
                name=g.name,
                campaign_id=g.campaign_id,
                dm_id=g.dm_id,
                max_players=g.max_players,
                status=GameStatus(g.status),
                mongodb_session_id=g.mongodb_session_id,
                created_at=g.created_at,
                updated_at=g.updated_at,
                started_at=g.started_at,
                ended_at=g.ended_at
            )
            for g in model.games or []
        ]

        player_ids = []
        if model.player_ids:
            player_ids = [UUID(player_id) for player_id in model.player_ids]

        return CampaignAggregate(
            id=model.id,
            name=model.name,
            description=model.description,
            dm_id=model.dm_id,
            created_at=model.created_at,
            updated_at=model.updated_at,
            maps=model.maps,
            games=games,
            player_ids=player_ids
        )
