# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from dataclasses import dataclass, field


@dataclass
class InvitedPlayer:
    """Invited player domain model."""
    user_id: UUID
    character_id: Optional[UUID] = None
    invited_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'user_id': str(self.user_id),
            'character_id': str(self.character_id) if self.character_id else None,
            'invited_at': self.invited_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'InvitedPlayer':
        """Create from dictionary."""
        return cls(
            user_id=UUID(data['user_id']),
            character_id=UUID(data['character_id']) if data.get('character_id') else None,
            invited_at=datetime.fromisoformat(data['invited_at'])
        )


@dataclass
class Moderator:
    """Moderator domain model."""
    user_id: UUID
    granted_by: UUID
    granted_at: datetime = field(default_factory=datetime.utcnow)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'user_id': str(self.user_id),
            'granted_by': str(self.granted_by),
            'granted_at': self.granted_at.isoformat()
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Moderator':
        """Create from dictionary."""
        return cls(
            user_id=UUID(data['user_id']),
            granted_by=UUID(data['granted_by']),
            granted_at=datetime.fromisoformat(data['granted_at'])
        )


@dataclass
class Campaign:
    """Campaign domain model (aggregate root)."""
    id: UUID
    name: str
    description: Optional[str] = None
    dm_id: UUID = None
    invited_players: List[InvitedPlayer] = field(default_factory=list)
    moderators: List[Moderator] = field(default_factory=list)
    maps: List[UUID] = field(default_factory=list)
    audio: Dict[str, Any] = field(default_factory=dict)
    media: Dict[str, Any] = field(default_factory=dict)
    scenes: Dict[str, Any] = field(default_factory=dict)
    created_at: datetime = field(default_factory=datetime.utcnow)
    updated_at: datetime = field(default_factory=datetime.utcnow)
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    
    def invite_player(self, user_id: UUID, character_id: Optional[UUID] = None) -> None:
        """Invite a player to the campaign."""
        # Check if already invited
        if any(p.user_id == user_id for p in self.invited_players):
            raise ValueError(f"User {user_id} already invited")
        
        invited_player = InvitedPlayer(user_id=user_id, character_id=character_id)
        self.invited_players.append(invited_player)
        self.updated_at = datetime.utcnow()
    
    def remove_player_invitation(self, user_id: UUID) -> None:
        """Remove a player invitation."""
        self.invited_players = [p for p in self.invited_players if p.user_id != user_id]
        self.updated_at = datetime.utcnow()
    
    def add_moderator(self, user_id: UUID, granted_by: UUID) -> None:
        """Add a moderator to the campaign."""
        # Check if already moderator
        if any(m.user_id == user_id for m in self.moderators):
            raise ValueError(f"User {user_id} already a moderator")
        
        moderator = Moderator(user_id=user_id, granted_by=granted_by)
        self.moderators.append(moderator)
        self.updated_at = datetime.utcnow()
    
    def remove_moderator(self, user_id: UUID) -> None:
        """Remove a moderator from the campaign."""
        self.moderators = [m for m in self.moderators if m.user_id != user_id]
        self.updated_at = datetime.utcnow()
    
    def add_map(self, map_id: UUID) -> None:
        """Add a map to the campaign."""
        if map_id not in self.maps:
            self.maps.append(map_id)
            self.updated_at = datetime.utcnow()
    
    def remove_map(self, map_id: UUID) -> None:
        """Remove a map from the campaign."""
        if map_id in self.maps:
            self.maps.remove(map_id)
            self.updated_at = datetime.utcnow()
    
    def update_audio_config(self, audio_config: Dict[str, Any]) -> None:
        """Update audio configuration."""
        self.audio = audio_config
        self.updated_at = datetime.utcnow()
    
    def update_media_config(self, media_config: Dict[str, Any]) -> None:
        """Update media configuration."""
        self.media = media_config
        self.updated_at = datetime.utcnow()
    
    def update_scenes_config(self, scenes_config: Dict[str, Any]) -> None:
        """Update scenes configuration."""
        self.scenes = scenes_config
        self.updated_at = datetime.utcnow()
    
    def soft_delete(self) -> None:
        """Soft delete the campaign."""
        self.is_deleted = True
        self.deleted_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'id': str(self.id),
            'name': self.name,
            'description': self.description,
            'dm_id': str(self.dm_id),
            'invited_players': [p.to_dict() for p in self.invited_players],
            'moderators': [m.to_dict() for m in self.moderators],
            'maps': [str(map_id) for map_id in self.maps],
            'audio': self.audio,
            'media': self.media,
            'scenes': self.scenes,
            'created_at': self.created_at.isoformat(),
            'updated_at': self.updated_at.isoformat(),
            'is_deleted': self.is_deleted,
            'deleted_at': self.deleted_at.isoformat() if self.deleted_at else None
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Campaign':
        """Create from dictionary."""
        return cls(
            id=UUID(data['id']),
            name=data['name'],
            description=data.get('description'),
            dm_id=UUID(data['dm_id']),
            invited_players=[InvitedPlayer.from_dict(p) for p in data.get('invited_players', [])],
            moderators=[Moderator.from_dict(m) for m in data.get('moderators', [])],
            maps=[UUID(map_id) for map_id in data.get('maps', [])],
            audio=data.get('audio', {}),
            media=data.get('media', {}),
            scenes=data.get('scenes', {}),
            created_at=datetime.fromisoformat(data['created_at']),
            updated_at=datetime.fromisoformat(data['updated_at']),
            is_deleted=data.get('is_deleted', False),
            deleted_at=datetime.fromisoformat(data['deleted_at']) if data.get('deleted_at') else None
        )