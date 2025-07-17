# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Optional, Dict, Any
from uuid import UUID
from sqlalchemy.orm import Session
from sqlalchemy import select, update, delete
from datetime import datetime

from models.campaign import Campaign as CampaignModel
from models.game import Game as GameModel
from domain.campaign_domain import Campaign, InvitedPlayer, Moderator
from enums.game_status import GameStatus


class CampaignRepository:
    """Repository for Campaign entities with aggregate serialization."""
    
    def __init__(self, db: Session):
        self.db = db
    
    def to_domain(self, model: CampaignModel) -> Campaign:
        """Convert database model to domain object."""
        return Campaign(
            id=model.id,
            name=model.name,
            description=model.description,
            dm_id=model.dm_id,
            invited_players=[InvitedPlayer.from_dict(p) for p in model.invited_players or []],
            moderators=[Moderator.from_dict(m) for m in model.moderators or []],
            maps=[UUID(map_id) for map_id in model.maps or []],
            audio=model.audio or {},
            media=model.media or {},
            scenes=model.scenes or {},
            created_at=model.created_at,
            updated_at=model.updated_at,
            is_deleted=model.is_deleted,
            deleted_at=model.deleted_at
        )
    
    def from_domain(self, domain: Campaign) -> Dict[str, Any]:
        """Convert domain object to database model data."""
        return {
            'id': domain.id,
            'name': domain.name,
            'description': domain.description,
            'dm_id': domain.dm_id,
            'invited_players': [p.to_dict() for p in domain.invited_players],
            'moderators': [m.to_dict() for m in domain.moderators],
            'maps': [str(map_id) for map_id in domain.maps],
            'audio': domain.audio,
            'media': domain.media,
            'scenes': domain.scenes,
            'created_at': domain.created_at,
            'updated_at': domain.updated_at,
            'is_deleted': domain.is_deleted,
            'deleted_at': domain.deleted_at
        }
    
    def get_by_id(self, campaign_id: UUID) -> Optional[Campaign]:
        """Get campaign by ID."""
        model = self.db.query(CampaignModel).filter(CampaignModel.id == campaign_id).first()
        
        if not model:
            return None
        
        return self.to_domain(model)
    
    def get_by_dm_id(self, dm_id: UUID) -> List[Campaign]:
        """Get all campaigns for a DM."""
        models = self.db.query(CampaignModel).filter(
            CampaignModel.dm_id == dm_id,
            CampaignModel.is_deleted == False
        ).all()
        return [self.to_domain(model) for model in models]
    
    def create(self, campaign_data: Dict[str, Any]) -> Campaign:
        """Create a new campaign."""
        campaign = CampaignModel(**campaign_data)
        self.db.add(campaign)
        self.db.commit()
        self.db.refresh(campaign)
        return self.to_domain(campaign)
    
    def update(self, campaign_domain: Campaign) -> Optional[Campaign]:
        """Update an existing campaign."""
        campaign_domain.updated_at = datetime.utcnow()
        campaign_data = self.from_domain(campaign_domain)
        
        # Remove fields that don't need updating
        campaign_data.pop('id', None)
        campaign_data.pop('created_at', None)
        
        # Update the model
        updated_count = self.db.query(CampaignModel).filter(CampaignModel.id == campaign_domain.id).update(campaign_data)
        
        if updated_count > 0:
            self.db.commit()
            model = self.db.query(CampaignModel).filter(CampaignModel.id == campaign_domain.id).first()
            return self.to_domain(model)
        
        return None
    
    def delete(self, campaign_id: UUID) -> bool:
        """Soft delete a campaign."""
        updated_count = self.db.query(CampaignModel).filter(CampaignModel.id == campaign_id).update({
            'is_deleted': True,
            'deleted_at': datetime.utcnow()
        })
        
        self.db.commit()
        return updated_count > 0
    
    def get_campaign_with_game_status(self, campaign_id: UUID) -> Optional[Dict[str, Any]]:
        """Get campaign with its associated game status for access control."""
        result = self.db.query(CampaignModel, GameModel).outerjoin(
            GameModel, CampaignModel.id == GameModel.campaign_id
        ).filter(
            CampaignModel.id == campaign_id, 
            CampaignModel.is_deleted == False
        ).first()
        
        if not result:
            return None
        
        campaign, game = result
        
        return {
            'campaign': self.to_domain(campaign),
            'game': game,
            'can_configure': game is None or game.status == GameStatus.INACTIVE
        }
    
    # Aggregate serialization methods
    def serialize_invited_players(self, invited_players: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Serialize invited players for database storage."""
        return [
            {
                'user_id': str(player['user_id']),
                'character_id': str(player['character_id']) if player.get('character_id') else None,
                'invited_at': player.get('invited_at', datetime.utcnow()).isoformat()
            }
            for player in invited_players
        ]
    
    def deserialize_invited_players(self, invited_players_json: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Deserialize invited players from database storage."""
        if not invited_players_json:
            return []
        
        return [
            {
                'user_id': UUID(player['user_id']),
                'character_id': UUID(player['character_id']) if player.get('character_id') else None,
                'invited_at': datetime.fromisoformat(player['invited_at'])
            }
            for player in invited_players_json
        ]
    
    def serialize_moderators(self, moderators: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Serialize moderators for database storage."""
        return [
            {
                'user_id': str(moderator['user_id']),
                'granted_by': str(moderator['granted_by']),
                'granted_at': moderator.get('granted_at', datetime.utcnow()).isoformat()
            }
            for moderator in moderators
        ]
    
    def deserialize_moderators(self, moderators_json: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Deserialize moderators from database storage."""
        if not moderators_json:
            return []
        
        return [
            {
                'user_id': UUID(moderator['user_id']),
                'granted_by': UUID(moderator['granted_by']),
                'granted_at': datetime.fromisoformat(moderator['granted_at'])
            }
            for moderator in moderators_json
        ]
    
    def serialize_maps(self, maps: List[UUID]) -> List[str]:
        """Serialize map IDs for database storage."""
        return [str(map_id) for map_id in maps]
    
    def deserialize_maps(self, maps_json: List[str]) -> List[UUID]:
        """Deserialize map IDs from database storage."""
        if not maps_json:
            return []
        return [UUID(map_id) for map_id in maps_json]
    
    def serialize_audio(self, audio: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize audio configuration for database storage."""
        # Audio configuration is already JSON-serializable
        return audio
    
    def deserialize_audio(self, audio_json: Dict[str, Any]) -> Dict[str, Any]:
        """Deserialize audio configuration from database storage."""
        return audio_json or {}
    
    def serialize_media(self, media: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize media configuration for database storage."""
        # Media configuration is already JSON-serializable
        return media
    
    def deserialize_media(self, media_json: Dict[str, Any]) -> Dict[str, Any]:
        """Deserialize media configuration from database storage."""
        return media_json or {}
    
    def serialize_scenes(self, scenes: Dict[str, Any]) -> Dict[str, Any]:
        """Serialize scene presets for database storage."""
        # Scene configuration is already JSON-serializable
        return scenes
    
    def deserialize_scenes(self, scenes_json: Dict[str, Any]) -> Dict[str, Any]:
        """Deserialize scene presets from database storage."""
        return scenes_json or {}
    
    def get_campaign_for_migration(self, campaign_id: UUID) -> Optional[Dict[str, Any]]:
        """Get campaign with deserialized aggregates for hot storage migration."""
        campaign = self.get_by_id(campaign_id)
        if not campaign:
            return None
        
        return {
            'id': campaign.id,
            'name': campaign.name,
            'description': campaign.description,
            'dm_id': campaign.dm_id,
            'invited_players': self.deserialize_invited_players(campaign.invited_players),
            'moderators': self.deserialize_moderators(campaign.moderators),
            'maps': self.deserialize_maps(campaign.maps),
            'audio': self.deserialize_audio(campaign.audio),
            'media': self.deserialize_media(campaign.media),
            'scenes': self.deserialize_scenes(campaign.scenes),
            'created_at': campaign.created_at,
            'updated_at': campaign.updated_at
        }