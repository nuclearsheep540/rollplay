# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

from datetime import datetime
from typing import Dict, List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from shared_contracts.character_config import CharacterConfig, ComponentChange


# CAMPAIGN REQUEST SCHEMAS

class CampaignCreateRequest(BaseModel):
    title: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    hero_image: Optional[str] = Field(None, max_length=255)
    hero_image_asset_id: Optional[str] = Field(None)
    max_players: int = Field(8, ge=1, le=8, description="Seats at the table (1-8)")


class CampaignUpdateRequest(BaseModel):
    title: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=1000)
    hero_image: Optional[str] = Field(None, max_length=255)
    hero_image_asset_id: Optional[str] = Field(None)
    max_players: Optional[int] = Field(None, ge=1, le=8, description="Seats at the table (1-8); applies at the next start")


class HostStatusResponse(BaseModel):
    is_host: bool
    session_id: str
    campaign_id: str


# CAMPAIGN RESPONSE SCHEMAS

class HeroImageAssetInfo(BaseModel):
    """Nested asset info for S3-backed hero images"""
    asset_id: str
    s3_url: Optional[str] = None
    file_size: Optional[int] = None
    filename: Optional[str] = None
    # The "card" focal region when the host has chosen one: {x, y, width, height} in the
    # image's native pixels. Every campaign card biases its cover-fit toward its centre.
    card_focal_area: Optional[Dict[str, float]] = None


class CampaignMemberResponse(BaseModel):
    """A roster member, and the character they have in the party (if any).

    All character fields are None for a member who has not built one — a roster member and
    a party member are not the same thing.
    """
    user_id: str
    username: str  # screen_name or email
    account_tag: Optional[str] = None
    campaign_role: str  # dm, player, spectator, mod
    character_id: Optional[str] = None
    character_display_name: Optional[str] = None
    character_is_alive: Optional[bool] = None
    character_avatar_url: Optional[str] = None  # Presigned URL, resolved at the endpoint
    # The avatar image's "token" focal square (tokens v3, decision 36) — biases
    # the party card's cover-fit so a portrait keeps its face in the wedge.
    character_avatar_focal_area: Optional[Dict[str, float]] = None
    # Stable identity for the avatar image, unlike the re-signed URL above.
    # The frontend keys its blob cache on this so a campaigns refetch doesn't
    # re-download an avatar that hasn't changed.
    character_avatar_asset_id: Optional[str] = None
    is_host: bool = False  # Kept for frontend backward compat (true when role=dm)


class CharacterConfigVersionSummary(BaseModel):
    """One published version, as the builder's Versions list shows it."""
    id: UUID
    version: int
    created_at: datetime
    component_count: int


class CharacterConfigStateResponse(BaseModel):
    """Everything the campaign builder and the character create flow need in one read.

    A non-host member gets ``draft=None`` and ``pending_changes=[]`` — the working copy is
    the GM's alone. They still get ``latest``, because that is what they build against.
    """
    draft: Optional[CharacterConfig] = None
    latest: Optional[CharacterConfig] = None
    latest_version_id: Optional[UUID] = None
    versions: List[CharacterConfigVersionSummary] = []
    pending_changes: List[ComponentChange] = []


class CampaignResponse(BaseModel):
    """Full campaign response with sessions - used for detail view"""
    id: str
    title: str
    description: Optional[str]
    hero_image: Optional[str]
    hero_image_asset: Optional[HeroImageAssetInfo] = None
    host_id: str
    host_screen_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_played_at: Optional[datetime] = None
    max_players: int = 8  # Seats at the table; applied at the next game start
    sessions: List = []  # Sessions fetched separately via session module
    invited_player_ids: List[str] = []
    player_ids: List[str] = []
    member_ids: List[str] = []  # All joined members regardless of role (excludes INVITED)
    members: List[CampaignMemberResponse] = []  # Full member detail (username + character)
    total_sessions: int = 0
    invited_count: int = 0
    player_count: int = 0
    # Latest published character config version number; None when the GM has published
    # none. The character create flow's chooser uses it to tell a campaign you can build
    # against from one that has nothing yet.
    character_config_version: Optional[int] = None

    class Config:
        from_attributes = True  # Allow automatic conversion from aggregates


class CampaignSummaryResponse(BaseModel):
    """Lightweight campaign response without sessions - used for list view"""
    id: str
    title: str
    description: Optional[str]
    hero_image: Optional[str]
    hero_image_asset: Optional[HeroImageAssetInfo] = None
    host_id: str
    host_screen_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    last_played_at: Optional[datetime] = None
    max_players: int = 8  # Seats at the table; applied at the next game start
    total_sessions: int = 0
    invited_player_ids: List[str] = []
    player_ids: List[str] = []
    member_ids: List[str] = []  # All joined members regardless of role (excludes INVITED)
    invited_count: int = 0

    class Config:
        from_attributes = True  # Allow automatic conversion from aggregates


class CampaignSetRoleRequest(BaseModel):
    """Request to change a campaign member's role."""
    campaign_id: str = Field(..., description="Campaign UUID")
    requesting_user_id: str = Field(..., description="UUID of the user requesting the change (must be DM)")
    target_user_id: str = Field(..., description="UUID of the user whose role is being changed")
    new_role: str = Field(..., description="New role to assign (e.g., 'mod', 'spectator')")


class CampaignSetRoleResponse(BaseModel):
    """Response confirming a role change."""
    success: bool
    campaign_id: str
    target_user_id: str
    new_role: str
