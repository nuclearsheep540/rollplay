# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Optional
from uuid import UUID
from .game_status import GameStatus


class GameEntity:
    """Game entity within Campaign aggregate - not a root aggregate"""
    
    def __init__(
        self,
        id: Optional[UUID] = None,
        name: Optional[str] = None,
        campaign_id: Optional[UUID] = None,
        dm_id: Optional[UUID] = None,
        max_players: int = 6,
        status: GameStatus = GameStatus.INACTIVE,
        mongodb_session_id: Optional[str] = None,
        created_at: Optional[datetime] = None,
        updated_at: Optional[datetime] = None,
        started_at: Optional[datetime] = None,
        ended_at: Optional[datetime] = None
    ):
        self.id = id
        self.name = name
        self.campaign_id = campaign_id
        self.dm_id = dm_id
        self.max_players = max_players
        self.status = status
        self.mongodb_session_id = mongodb_session_id
        self.created_at = created_at
        self.updated_at = updated_at
        self.started_at = started_at
        self.ended_at = ended_at
    
    @classmethod
    def create(cls, name: str, campaign_id: UUID, dm_id: UUID, max_players: int = 6):
        """Create new game with business rules validation"""
        # Business rule: Game name must be provided
        if not name or not name.strip():
            raise ValueError("Game name is required")
        
        normalized_name = name.strip()
        if len(normalized_name) > 100:
            raise ValueError("Game name too long (max 100 characters)")
        
        # Business rule: Must belong to campaign and have DM
        if not campaign_id:
            raise ValueError("Game must belong to a campaign")
        if not dm_id:
            raise ValueError("Game must have a DM")
        
        # Business rule: Max players validation
        if max_players < 1 or max_players > 20:
            raise ValueError("Max players must be between 1 and 20")
        
        now = datetime.utcnow()
        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            campaign_id=campaign_id,
            dm_id=dm_id,
            max_players=max_players,
            status=GameStatus.INACTIVE,
            mongodb_session_id=None,
            created_at=now,
            updated_at=now,
            started_at=None,
            ended_at=None
        )
    
    def start_session(self, mongodb_session_id: str):
        """Start the game session - transitions to hot storage"""
        # Business rule: Can only start INACTIVE games
        if self.status != GameStatus.INACTIVE:
            raise ValueError(f"Cannot start game in {self.status.value} state")
        
        if not mongodb_session_id:
            raise ValueError("MongoDB session ID required to start game")
        
        # Use proper transition through STARTING to ACTIVE
        if not self.status.can_transition_to(GameStatus.STARTING):
            raise ValueError(f"Invalid transition from {self.status.value} to starting")
        
        self.status = GameStatus.STARTING
        self.mongodb_session_id = mongodb_session_id
        self.started_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
    
    def activate_session(self):
        """Complete session startup - move from STARTING to ACTIVE"""
        if self.status != GameStatus.STARTING:
            raise ValueError(f"Cannot activate game in {self.status.value} state")
        
        if not self.status.can_transition_to(GameStatus.ACTIVE):
            raise ValueError(f"Invalid transition from {self.status.value} to active")
        
        self.status = GameStatus.ACTIVE
        self.updated_at = datetime.utcnow()
    
    def end_session(self):
        """End the game session - transitions back to cold storage"""
        # Business rule: Can only end ACTIVE games
        if self.status != GameStatus.ACTIVE:
            raise ValueError(f"Cannot end game in {self.status.value} state")
        
        if not self.status.can_transition_to(GameStatus.STOPPING):
            raise ValueError(f"Invalid transition from {self.status.value} to stopping")
        
        self.status = GameStatus.STOPPING
        self.updated_at = datetime.utcnow()
    
    def complete_shutdown(self):
        """Complete session shutdown - move from STOPPING to INACTIVE"""
        if self.status != GameStatus.STOPPING:
            raise ValueError(f"Cannot complete shutdown in {self.status.value} state")
        
        if not self.status.can_transition_to(GameStatus.INACTIVE):
            raise ValueError(f"Invalid transition from {self.status.value} to inactive")
        
        self.status = GameStatus.INACTIVE
        self.ended_at = datetime.utcnow()
        self.updated_at = datetime.utcnow()
        # Note: mongodb_session_id kept for potential recovery/audit
    
    def update_details(self, name: Optional[str] = None, max_players: Optional[int] = None):
        """Update game details with business rules"""
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Game name cannot be empty")
            if len(normalized_name) > 100:
                raise ValueError("Game name too long (max 100 characters)")
            self.name = normalized_name
        
        if max_players is not None:
            if max_players < 1 or max_players > 20:
                raise ValueError("Max players must be between 1 and 20")
            self.max_players = max_players
        
        self.updated_at = datetime.utcnow()
    
    def is_active(self) -> bool:
        """Check if game is currently active"""
        return self.status == GameStatus.ACTIVE
    
    def is_inactive(self) -> bool:
        """Check if game is inactive"""
        return self.status == GameStatus.INACTIVE
    
    def is_starting(self) -> bool:
        """Check if game is starting up"""
        return self.status == GameStatus.STARTING
        
    def is_stopping(self) -> bool:
        """Check if game is shutting down"""
        return self.status == GameStatus.STOPPING
    
    def can_be_deleted(self) -> bool:
        """Business rule: Games can only be deleted if INACTIVE"""
        return self.status == GameStatus.INACTIVE
    
    def can_be_started(self) -> bool:
        """Business rule: Games can only be started if INACTIVE"""
        return self.status == GameStatus.INACTIVE
    
    def can_be_ended(self) -> bool:
        """Business rule: Games can only be ended if ACTIVE"""
        return self.status == GameStatus.ACTIVE
    
    def requires_hot_storage(self) -> bool:
        """Check if game requires MongoDB hot storage"""
        return self.status.requires_hot_storage()
    
    def get_session_duration(self) -> Optional[int]:
        """Get session duration in seconds if game has been started"""
        if not self.started_at:
            return None
        
        end_time = self.ended_at or datetime.utcnow()
        return int((end_time - self.started_at).total_seconds())