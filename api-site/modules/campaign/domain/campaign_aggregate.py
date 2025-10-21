# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional
from uuid import UUID


@dataclass
class CampaignAggregate:
    """
    Campaign Aggregate Root

    Campaigns organize games and manage players.
    Game is now a separate aggregate - Campaign only stores game_ids.
    """
    id: Optional[UUID]
    name: str
    description: str
    dm_id: UUID
    created_at: datetime
    updated_at: datetime
    maps: Optional[str]
    game_ids: List[UUID] = field(default_factory=list)  # References to Game aggregates
    player_ids: List[UUID] = field(default_factory=list)

    @classmethod
    def create(cls, name: str, description: str, dm_id: UUID):
        """Create new campaign with business rules validation"""
        # Business rule: Campaign name must be provided and valid
        if not name or not name.strip():
            raise ValueError("Campaign name is required")

        normalized_name = name.strip()
        if len(normalized_name) > 100:
            raise ValueError("Campaign name too long (max 100 characters)")

        # Business rule: Description is optional but has length limit
        normalized_description = description.strip() if description else ""
        if len(normalized_description) > 500:
            raise ValueError("Campaign description too long (max 500 characters)")

        # Business rule: DM must be specified
        if not dm_id:
            raise ValueError("Campaign must have a DM")

        now = datetime.utcnow()
        return cls(
            id=None,  # Will be set by repository
            name=normalized_name,
            description=normalized_description,
            dm_id=dm_id,
            created_at=now,
            updated_at=now,
            maps=None,
            game_ids=[],
            player_ids=[]
        )

    def add_game(self, game_id: UUID) -> None:
        """
        Add a game reference to this campaign.

        Note: Game creation happens through GameRepository.
        Campaign just tracks which games belong to it.
        """
        if game_id in self.game_ids:
            raise ValueError("Game already belongs to this campaign")

        # Business rule: Campaign can have maximum games (configurable)
        max_games_per_campaign = 20  # Business policy
        if len(self.game_ids) >= max_games_per_campaign:
            raise ValueError(f"Campaign cannot exceed {max_games_per_campaign} games")

        self.game_ids.append(game_id)
        self.update_timestamp()

    def remove_game(self, game_id: UUID) -> bool:
        """
        Remove a game reference from this campaign.

        Note: Actual game deletion happens through GameRepository.
        This just removes the reference.
        """
        if game_id in self.game_ids:
            self.game_ids.remove(game_id)
            self.update_timestamp()
            return True
        return False

    def update_details(self, name: Optional[str] = None, description: Optional[str] = None):
        """Update campaign details with business rules"""
        if name is not None:
            normalized_name = name.strip()
            if not normalized_name:
                raise ValueError("Campaign name cannot be empty")
            if len(normalized_name) > 100:
                raise ValueError("Campaign name too long (max 100 characters)")
            self.name = normalized_name

        if description is not None:
            normalized_description = description.strip()
            if len(normalized_description) > 500:
                raise ValueError("Campaign description too long (max 500 characters)")
            self.description = normalized_description

        self.update_timestamp()

    def update_timestamp(self):
        """Update the last modified timestamp"""
        self.updated_at = datetime.utcnow()

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if campaign is owned by specific user"""
        return self.dm_id == user_id

    def get_total_games(self) -> int:
        """Get total number of games in campaign"""
        return len(self.game_ids)

    def can_be_deleted(self) -> bool:
        """
        Business rule: Campaign can only be deleted if no games exist.

        Note: Active game check happens in GameRepository.
        This just ensures no game references exist.
        """
        return len(self.game_ids) == 0

    def add_player(self, user_id: UUID) -> None:
        """Add a player to this campaign"""
        # Business rule: Cannot add DM as player
        if user_id == self.dm_id:
            raise ValueError("DM cannot be added as a player")

        # Business rule: Player must be unique
        if user_id in self.player_ids:
            raise ValueError("User is already a player in this campaign")

        self.player_ids.append(user_id)
        self.update_timestamp()

    def remove_player(self, user_id: UUID) -> None:
        """Remove a player from this campaign"""
        if user_id in self.player_ids:
            self.player_ids.remove(user_id)
            self.update_timestamp()

    def is_member(self, user_id: UUID) -> bool:
        """Check if user is either DM or player in this campaign"""
        return self.is_owned_by(user_id) or user_id in self.player_ids

    def is_player(self, user_id: UUID) -> bool:
        """Check if user is a player (not DM) in this campaign"""
        return user_id in self.player_ids

    def get_player_count(self) -> int:
        """Get total number of players (excluding DM)"""
        return len(self.player_ids)

    def get_all_member_ids(self) -> List[UUID]:
        """Get all member IDs (DM + players)"""
        return [self.dm_id] + self.player_ids
