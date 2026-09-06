# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from dataclasses import dataclass, field
from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from modules.campaign.domain.campaign_role import CampaignRole


@dataclass
class HeroImageAssetMeta:
    """Lightweight read-only metadata for hero image asset, populated from eager-loaded relationship."""
    s3_key: str
    file_size: Optional[int] = None
    filename: Optional[str] = None


@dataclass
class CampaignAggregate:
    """
    Campaign Aggregate Root

    Campaigns organize play and manage players. A campaign has exactly ONE
    session, for its whole life — its own aggregate, referenced by id, read from
    the sessions table's campaign_id foreign key and never stored on the campaign
    row. Settings that describe how the game runs (the seat count) live here, on
    the durable thing, not on the session that a reset replaces.

    Membership:
    - Each user has exactly one role per campaign (enforced by unique constraint).
    - DM role is immutable — set once at campaign creation.
    - created_by tracks the campaign creator for audit/ownership.
    """
    id: Optional[UUID]
    title: str
    description: str
    hero_image: Optional[str]
    created_by: UUID
    created_at: datetime
    updated_at: datetime
    hero_image_asset_id: Optional[UUID] = None
    hero_image_asset_meta: Optional[HeroImageAssetMeta] = None
    # When this campaign was last played, stamped when a session goes live.
    # Distinct from updated_at, which tracks edits to the campaign itself.
    last_played_at: Optional[datetime] = None
    # Seats at the table (1-8). Pushed into the game at every start, so an edit
    # made while a game is running takes effect the next time it runs.
    max_players: int = 8
    session_ids: List[UUID] = field(default_factory=list)
    members: Dict[UUID, CampaignRole] = field(default_factory=dict)

    @classmethod
    def create(
        cls,
        title: str,
        description: str,
        created_by: UUID,
        hero_image: Optional[str] = None,
        hero_image_asset_id: Optional[UUID] = None,
        max_players: int = 8
        ):
        """Create new campaign with business rules validation"""
        if not title or not title.strip():
            raise ValueError("Campaign title is required")

        normalized_title = title.strip()
        if len(normalized_title) > 100:
            raise ValueError("Campaign title too long (max 100 characters)")

        normalized_description = description.strip() if description else ""
        if len(normalized_description) > 1000:
            raise ValueError("Campaign description too long (max 1000 characters)")

        if not created_by:
            raise ValueError("Campaign must have a creator")

        now = datetime.utcnow()
        return cls(
            id=None,
            title=normalized_title,
            description=normalized_description,
            hero_image=hero_image if not hero_image_asset_id else None,
            hero_image_asset_id=hero_image_asset_id,
            created_by=created_by,
            created_at=now,
            updated_at=now,
            max_players=cls._validate_max_players(max_players),
            session_ids=[],
            members={created_by: CampaignRole.DM},
        )

    @staticmethod
    def _validate_max_players(max_players: int) -> int:
        """Validate the seat count is within the range the game supports (1-8).

        api-game builds its seat layout from this number, so anything outside
        the range would produce a table the runtime cannot render.
        """
        if not isinstance(max_players, int):
            raise ValueError("max_players must be an integer")
        if max_players < 1 or max_players > 8:
            raise ValueError("max_players must be between 1 and 8")
        return max_players

    # --- Role Management ---

    @property
    def dm_id(self) -> Optional[UUID]:
        """Get the DM's user ID."""
        return next((uid for uid, role in self.members.items() if role == CampaignRole.DM), None)

    @property
    def player_ids(self) -> List[UUID]:
        """Get all user IDs with PLAYER role."""
        return [uid for uid, role in self.members.items() if role == CampaignRole.PLAYER]

    @property
    def spectator_ids(self) -> List[UUID]:
        """Get all user IDs with SPECTATOR role."""
        return [uid for uid, role in self.members.items() if role == CampaignRole.SPECTATOR]

    @property
    def invited_player_ids(self) -> List[UUID]:
        """Get all user IDs with INVITED role."""
        return [uid for uid, role in self.members.items() if role == CampaignRole.INVITED]

    @property
    def mod_ids(self) -> List[UUID]:
        """Get all user IDs with MOD role."""
        return [uid for uid, role in self.members.items() if role == CampaignRole.MOD]

    def get_role(self, user_id: UUID) -> Optional[CampaignRole]:
        """Get a user's role in this campaign, or None if not a member."""
        return self.members.get(user_id)

    def set_role(self, user_id: UUID, role: CampaignRole) -> None:
        """
        Set a user's role in this campaign.

        Enforces the invariant that DM is immutable:
        - Cannot set anyone TO DM role
        - Cannot change the DM's role to something else

        This is the single method for all non-DM role transitions.
        """
        if role == CampaignRole.DM:
            raise ValueError("DM role cannot be assigned — it is set at campaign creation")

        current_role = self.members.get(user_id)
        if current_role == CampaignRole.DM:
            raise ValueError("Cannot change the DM's role")

        if user_id not in self.members:
            raise ValueError("User is not a member of this campaign")

        self.members[user_id] = role
        self.update_timestamp()

    def is_dm(self, user_id: UUID) -> bool:
        """Check if user is the DM of this campaign."""
        return self.members.get(user_id) == CampaignRole.DM

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if campaign was created by this user (audit/ownership)."""
        return self.created_by == user_id

    # --- Session Management ---

    # session_ids is read-derived from the sessions table's campaign_id foreign
    # key, so this method validates and adjusts the in-memory view only. It
    # deliberately leaves updated_at alone: a session's lifecycle is not an edit
    # to the campaign, and the card that reads updated_at means "last edited".

    def add_session(self, session_id: UUID) -> None:
        """Attach this campaign's session — the invariant is exactly one.

        A second session would give the campaign two sets of token boards and
        two adventure logs with no rule for which the game starts from.
        """
        if session_id in self.session_ids:
            raise ValueError("Session already belongs to this campaign")

        if self.session_ids:
            raise ValueError("Campaign already has a session")

        self.session_ids.append(session_id)

    def update_details(self, title: Optional[str] = None, description: Optional[str] = None, hero_image: str = "UNSET", hero_image_asset_id: str = "UNSET", max_players: Optional[int] = None):
        """Update campaign details with business rules"""
        if title is not None:
            normalized_title = title.strip()
            if not normalized_title:
                raise ValueError("Campaign title cannot be empty")
            if len(normalized_title) > 100:
                raise ValueError("Campaign title too long (max 100 characters)")
            self.title = normalized_title

        if description is not None:
            normalized_description = description.strip()
            if len(normalized_description) > 1000:
                raise ValueError("Campaign description too long (max 1000 characters)")
            self.description = normalized_description

        # hero_image and hero_image_asset_id are mutually exclusive
        if hero_image_asset_id != "UNSET":
            self.hero_image_asset_id = UUID(hero_image_asset_id) if hero_image_asset_id else None
            if self.hero_image_asset_id:
                self.hero_image = None
        if hero_image != "UNSET":
            self.hero_image = hero_image if hero_image else None
            if self.hero_image:
                self.hero_image_asset_id = None

        if max_players is not None:
            self.max_players = self._validate_max_players(max_players)

        self.update_timestamp()

    def update_timestamp(self):
        """Update the last modified timestamp"""
        self.updated_at = datetime.utcnow()

    def mark_played(self):
        """Stamp the campaign as played (a session went live).

        Deliberately does not touch updated_at: playing is not editing.
        """
        self.last_played_at = datetime.utcnow()

    def get_total_sessions(self) -> int:
        """Get total number of sessions in campaign"""
        return len(self.session_ids)

    # --- Membership Management ---

    def invite_player(self, user_id: UUID) -> None:
        """Invite a user to this campaign (pending acceptance)."""
        if user_id in self.members:
            current_role = self.members[user_id]
            if current_role == CampaignRole.INVITED:
                raise ValueError("User is already invited to this campaign")
            raise ValueError("User is already a member of this campaign")

        self.members[user_id] = CampaignRole.INVITED
        self.update_timestamp()

    def accept_invite(self, user_id: UUID) -> None:
        """User accepts campaign invite — transitions INVITED → SPECTATOR."""
        if self.members.get(user_id) != CampaignRole.INVITED:
            raise ValueError("User is not invited to this campaign")

        self.members[user_id] = CampaignRole.SPECTATOR
        self.update_timestamp()

    def decline_invite(self, user_id: UUID) -> None:
        """User declines campaign invite."""
        if self.members.get(user_id) != CampaignRole.INVITED:
            raise ValueError("User is not invited to this campaign")

        del self.members[user_id]
        self.update_timestamp()

    def cancel_invite(self, user_id: UUID) -> None:
        """DM cancels a pending invite before it's accepted."""
        if self.members.get(user_id) != CampaignRole.INVITED:
            raise ValueError("User does not have a pending invite to this campaign")

        del self.members[user_id]
        self.update_timestamp()

    def add_player(self, user_id: UUID) -> None:
        """
        Direct add player to campaign (bypasses invite flow).
        Used for backward compatibility and special cases.
        Adds as SPECTATOR — character selection promotes to PLAYER.
        """
        if self.members.get(user_id) == CampaignRole.DM:
            raise ValueError("DM cannot be added as a player")

        if user_id in self.members and self.members[user_id] != CampaignRole.INVITED:
            raise ValueError("User is already a member of this campaign")

        self.members[user_id] = CampaignRole.SPECTATOR
        self.update_timestamp()

    def remove_member(self, user_id: UUID) -> None:
        """Remove a member from this campaign. Cannot remove the DM."""
        if self.members.get(user_id) == CampaignRole.DM:
            raise ValueError("Cannot remove the DM from the campaign")

        if user_id in self.members:
            del self.members[user_id]
            self.update_timestamp()

    # --- Query Methods ---

    def is_invited(self, user_id: UUID) -> bool:
        """Check if user has a pending invite to this campaign."""
        return self.members.get(user_id) == CampaignRole.INVITED

    def is_member(self, user_id: UUID) -> bool:
        """Check if user is an active member (any role except INVITED)."""
        role = self.members.get(user_id)
        return role is not None and role != CampaignRole.INVITED

    def is_player(self, user_id: UUID) -> bool:
        """Check if user has the PLAYER role."""
        return self.members.get(user_id) == CampaignRole.PLAYER

    def get_player_count(self) -> int:
        """Get total number of players (PLAYER role only)."""
        return len(self.player_ids)

    def get_invited_count(self) -> int:
        """Get total number of pending invites."""
        return len(self.invited_player_ids)

    def get_all_member_ids(self) -> List[UUID]:
        """Get all active member IDs (all roles except INVITED)."""
        return [uid for uid, role in self.members.items() if role != CampaignRole.INVITED]
