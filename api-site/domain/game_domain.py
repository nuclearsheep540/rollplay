# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from typing import List, Dict, Any, Optional
from uuid import UUID
from datetime import datetime
from dataclasses import dataclass, field

from enums.game_status import GameStatus


@dataclass
class Player:
    """Player domain model."""
    user_id: UUID
    character_id: Optional[UUID] = None
    character_name: Optional[str] = None
    joined_at: datetime = field(default_factory=datetime.utcnow)
    character_stats: Dict[str, Any] = field(default_factory=dict)
    
    def update_character_stats(self, stats: Dict[str, Any]) -> None:
        """Update character statistics."""
        self.character_stats.update(stats)
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'user_id': str(self.user_id),
            'character_id': str(self.character_id) if self.character_id else None,
            'character_name': self.character_name,
            'joined_at': self.joined_at.isoformat(),
            'character_stats': self.character_stats
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Player':
        """Create from dictionary."""
        return cls(
            user_id=UUID(data['user_id']),
            character_id=UUID(data['character_id']) if data.get('character_id') else None,
            character_name=data.get('character_name'),
            joined_at=datetime.fromisoformat(data['joined_at']),
            character_stats=data.get('character_stats', {})
        )


@dataclass
class TurnEntry:
    """Turn order entry domain model."""
    player_id: UUID
    player_name: str
    initiative: int = 0
    has_acted: bool = False
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization."""
        return {
            'player_id': str(self.player_id),
            'player_name': self.player_name,
            'initiative': self.initiative,
            'has_acted': self.has_acted
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'TurnEntry':
        """Create from dictionary."""
        return cls(
            player_id=UUID(data['player_id']),
            player_name=data['player_name'],
            initiative=data.get('initiative', 0),
            has_acted=data.get('has_acted', False)
        )


@dataclass
class Game:
    """Game domain model (aggregate root)."""
    id: UUID
    campaign_id: UUID
    name: str
    dm_id: UUID
    status: GameStatus = GameStatus.INACTIVE
    location: Optional[str] = None
    party: List[Player] = field(default_factory=list)
    max_players: int = 8
    adventure_logs: List[Dict[str, Any]] = field(default_factory=list)
    combat_active: bool = False
    turn_order: List[TurnEntry] = field(default_factory=list)
    current_session_number: int = 1
    total_play_time: int = 0
    created_at: datetime = field(default_factory=datetime.utcnow)
    last_activity_at: datetime = field(default_factory=datetime.utcnow)
    
    def add_player(self, player: Player) -> None:
        """Add a player to the game."""
        if len(self.party) >= self.max_players:
            raise ValueError(f"Game is full (max {self.max_players} players)")
        
        # Check if player already exists
        if any(p.user_id == player.user_id for p in self.party):
            raise ValueError(f"Player {player.user_id} already in game")
        
        self.party.append(player)
        self.last_activity_at = datetime.utcnow()
    
    def remove_player(self, user_id: UUID) -> None:
        """Remove a player from the game."""
        self.party = [p for p in self.party if p.user_id != user_id]
        self.last_activity_at = datetime.utcnow()
    
    def start_combat(self, initiative_order: List[TurnEntry]) -> None:
        """Start combat with initiative order."""
        self.combat_active = True
        self.turn_order = sorted(initiative_order, key=lambda x: x.initiative, reverse=True)
        self.last_activity_at = datetime.utcnow()
    
    def end_combat(self) -> None:
        """End combat."""
        self.combat_active = False
        self.turn_order = []
        self.last_activity_at = datetime.utcnow()
    
    def change_location(self, new_location: str) -> None:
        """Change game location."""
        self.location = new_location
        self.last_activity_at = datetime.utcnow()
    
    def add_adventure_log(self, log_entry: Dict[str, Any]) -> None:
        """Add entry to adventure log."""
        log_entry['timestamp'] = datetime.utcnow().isoformat()
        self.adventure_logs.append(log_entry)
        self.last_activity_at = datetime.utcnow()
    
    def can_transition_to(self, target_status: GameStatus) -> bool:
        """Check if game can transition to target status."""
        return self.status.can_transition_to(target_status)
    
    def transition_to(self, target_status: GameStatus) -> None:
        """Transition to target status."""
        if not self.can_transition_to(target_status):
            raise ValueError(f"Invalid transition from {self.status} to {target_status}")
        
        self.status = target_status
        self.last_activity_at = datetime.utcnow()
    
    def to_hot_storage(self) -> Dict[str, Any]:
        """Convert to hot storage format (MongoDB)."""
        return {
            '_id': str(self.id),
            'campaign_id': str(self.campaign_id),
            'name': self.name,
            'dm_id': str(self.dm_id),
            'location': self.location,
            'party': [player.to_dict() for player in self.party],
            'max_players': self.max_players,
            'adventure_logs': self.adventure_logs,
            'combat_active': self.combat_active,
            'turn_order': [turn.to_dict() for turn in self.turn_order],
            'current_session_number': self.current_session_number,
            'total_play_time': self.total_play_time,
            'created_at': self.created_at.isoformat(),
            'last_activity': self.last_activity_at.isoformat(),
            'players_connected': []  # Will be populated by WebSocket manager
        }
    
    @classmethod
    def from_hot_storage(cls, data: Dict[str, Any]) -> 'Game':
        """Create from hot storage format (MongoDB)."""
        return cls(
            id=UUID(data['_id']),
            campaign_id=UUID(data['campaign_id']),
            name=data['name'],
            dm_id=UUID(data['dm_id']),
            status=GameStatus.ACTIVE,  # Hot storage means active
            location=data.get('location'),
            party=[Player.from_dict(p) for p in data.get('party', [])],
            max_players=data.get('max_players', 8),
            adventure_logs=data.get('adventure_logs', []),
            combat_active=data.get('combat_active', False),
            turn_order=[TurnEntry.from_dict(t) for t in data.get('turn_order', [])],
            current_session_number=data.get('current_session_number', 1),
            total_play_time=data.get('total_play_time', 0),
            created_at=datetime.fromisoformat(data['created_at']),
            last_activity_at=datetime.fromisoformat(data['last_activity'])
        )