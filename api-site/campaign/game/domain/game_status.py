# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from enum import Enum


class GameStatus(str, Enum):
    """Game lifecycle status enumeration."""
    
    INACTIVE = "inactive"
    STARTING = "starting"
    ACTIVE = "active"
    STOPPING = "stopping"
    
    def __str__(self) -> str:
        return self.value
    
    @classmethod
    def from_string(cls, value: str) -> 'GameStatus':
        """Create GameStatus from string value."""
        for status in cls:
            if status.value == value:
                return status
        raise ValueError(f"Invalid game status: {value}")
    
    def can_transition_to(self, target_status: 'GameStatus') -> bool:
        """Check if transition to target status is valid."""
        valid_transitions = {
            GameStatus.INACTIVE: [GameStatus.STARTING],
            GameStatus.STARTING: [GameStatus.ACTIVE, GameStatus.INACTIVE],  # INACTIVE for rollback
            GameStatus.ACTIVE: [GameStatus.STOPPING],
            GameStatus.STOPPING: [GameStatus.INACTIVE]
        }
        
        return target_status in valid_transitions.get(self, [])
    
    def requires_hot_storage(self) -> bool:
        """Check if this status requires hot storage to exist."""
        return self in [GameStatus.STARTING, GameStatus.ACTIVE, GameStatus.STOPPING]
    
    def allows_campaign_configuration(self) -> bool:
        """Check if campaign can be configured in this status."""
        return self == GameStatus.INACTIVE