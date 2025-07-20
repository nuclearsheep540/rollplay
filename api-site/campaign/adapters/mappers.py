# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import Optional, List
from uuid import UUID
from campaign.orm.campaign_model import Campaign as CampaignModel
from campaign.orm.game_model import Game as GameModel
from campaign.domain.aggregates import CampaignAggregate
from campaign.game.domain.entities import GameEntity, GameStatus


def to_domain(model: CampaignModel) -> Optional[CampaignAggregate]:
    """Convert Campaign ORM model to domain aggregate"""
    if not model:
        return None
    
    # Convert associated games
    games = [_game_to_domain(game_model) for game_model in model.games or []]
    
    # Convert player_ids from JSON to list of UUIDs
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


def from_domain(aggregate: CampaignAggregate) -> CampaignModel:
    """Convert Campaign domain aggregate to ORM model"""
    # Convert player_ids from UUIDs to strings for JSON storage
    player_ids_json = [str(player_id) for player_id in aggregate.player_ids]
    
    return CampaignModel(
        id=aggregate.id,
        name=aggregate.name,
        description=aggregate.description,
        dm_id=aggregate.dm_id,
        created_at=aggregate.created_at,
        updated_at=aggregate.updated_at,
        maps=aggregate.maps,
        player_ids=player_ids_json
        # Note: games are handled separately in repository
    )


def update_model_from_domain(model: CampaignModel, aggregate: CampaignAggregate):
    """Update Campaign ORM model from domain aggregate"""
    model.name = aggregate.name
    model.description = aggregate.description
    model.updated_at = aggregate.updated_at
    model.maps = aggregate.maps
    # Convert player_ids from UUIDs to strings for JSON storage
    model.player_ids = [str(player_id) for player_id in aggregate.player_ids]
    # Note: dm_id and created_at are immutable after creation
    # Note: games are handled separately in repository


def _game_to_domain(model: GameModel) -> GameEntity:
    """Convert Game ORM model to domain entity"""
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


def _game_from_domain(entity: GameEntity) -> GameModel:
    """Convert Game domain entity to ORM model"""
    return GameModel(
        id=entity.id,
        name=entity.name,
        campaign_id=entity.campaign_id,
        dm_id=entity.dm_id,
        max_players=entity.max_players,
        status=entity.status.value,
        mongodb_session_id=entity.mongodb_session_id,
        created_at=entity.created_at,
        updated_at=entity.updated_at,
        started_at=entity.started_at,
        ended_at=entity.ended_at
    )