# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset API Schemas - Pydantic models for request/response validation
"""

from datetime import datetime
from typing import List, Optional
from uuid import UUID

from pydantic import BaseModel, Field

from modules.library.domain.media_asset_type import MediaAssetType
from shared_contracts.cine import MotionConfig, VisualOverlay


class UploadUrlResponse(BaseModel):
    """Response containing presigned S3 upload URL"""
    upload_url: str = Field(..., description="Presigned PUT URL for S3 upload")
    key: str = Field(..., description="S3 object key to use when confirming upload")


class ConfirmUploadRequest(BaseModel):
    """Request to confirm an upload completed and create media asset record"""
    key: str = Field(..., description="S3 object key from upload URL response")
    asset_type: MediaAssetType = Field(default=MediaAssetType.MAP, description="Type of asset (map, music, sfx, image)")
    campaign_id: Optional[UUID] = Field(None, description="Campaign to associate with (optional)")
    file_size: Optional[int] = Field(None, description="File size in bytes (optional)")


class AssociateRequest(BaseModel):
    """Request to associate a media asset with a campaign"""
    campaign_id: UUID = Field(..., description="Campaign to associate with")


class RenameRequest(BaseModel):
    """Request to rename a media asset"""
    filename: str = Field(..., min_length=1, max_length=255, description="New display filename")


class ChangeTypeRequest(BaseModel):
    """Request to change a media asset's type tag"""
    asset_type: MediaAssetType = Field(..., description="New asset type (map, image, music, sfx)")


class MediaAssetResponse(BaseModel):
    """Flat polymorphic response for any media asset type.

    All subtype-specific fields are optional — only the fields relevant
    to the asset's type will be populated. This mirrors the joined-table
    inheritance in PostgreSQL: one shape, many asset types.
    """
    id: str
    user_id: str
    filename: str
    s3_key: str
    s3_url: Optional[str] = None  # Presigned download URL (generated on demand)
    content_type: str
    asset_type: str  # Return as string for JSON compatibility
    file_size: Optional[int] = None
    campaign_ids: List[str] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    # Map fields
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None
    grid_opacity: Optional[float] = None
    grid_offset_x: Optional[int] = None
    grid_offset_y: Optional[int] = None
    grid_line_color: Optional[str] = None
    grid_cell_size: Optional[float] = None

    # Audio fields (music + sfx)
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None

    # Music-only effect fields
    effect_eq_enabled: Optional[bool] = None
    effect_hpf_enabled: Optional[bool] = None
    effect_hpf_mix: Optional[float] = None
    effect_lpf_enabled: Optional[bool] = None
    effect_lpf_mix: Optional[float] = None
    effect_reverb_enabled: Optional[bool] = None
    effect_reverb_mix: Optional[float] = None
    effect_reverb_preset: Optional[str] = None

    # Music-only loop/BPM fields
    loop_start: Optional[float] = None
    loop_end: Optional[float] = None
    bpm: Optional[float] = None
    loop_mode: Optional[str] = None
    time_signature: Optional[str] = None

    # Image fields
    image_fit: Optional[str] = None
    aspect_ratio: Optional[str] = None
    display_mode: Optional[str] = None
    image_position_x: Optional[float] = None
    image_position_y: Optional[float] = None
    visual_overlays: Optional[list] = None
    motion: Optional[dict] = None

    class Config:
        from_attributes = True
        extra = 'forbid'


class MediaAssetListResponse(BaseModel):
    """Response containing list of media assets"""
    assets: List[MediaAssetResponse]
    total: int


class UpdateGridConfigRequest(BaseModel):
    """Request to update map grid configuration"""
    grid_width: Optional[int] = Field(None, ge=1, le=1000, description="Grid width in cells")
    grid_height: Optional[int] = Field(None, ge=1, le=1000, description="Grid height in cells")
    grid_opacity: Optional[float] = Field(None, ge=0.0, le=1.0, description="Grid overlay opacity")
    grid_offset_x: Optional[int] = Field(None, description="Whole-grid X shift (image px)")
    grid_offset_y: Optional[int] = Field(None, description="Whole-grid Y shift (image px)")
    grid_line_color: Optional[str] = Field(None, description="Grid line colour hex e.g. '#d1d5db'")
    grid_cell_size: Optional[float] = Field(None, ge=8, le=500, description="Cell size in native image pixels")


class UpdateImageConfigRequest(BaseModel):
    """Request to update image configuration"""
    image_fit: Optional[str] = Field(None, description="Image fit: float, wrap, or letterbox")
    aspect_ratio: Optional[str] = Field(None, description="Aspect ratio preset for letterbox")
    display_mode: Optional[str] = Field(None, description="Display mode: standard or cine")
    image_position_x: Optional[float] = Field(None, ge=0.0, le=100.0, description="Image position X within frame (0-100%)")
    image_position_y: Optional[float] = Field(None, ge=0.0, le=100.0, description="Image position Y within frame (0-100%)")
    visual_overlays: Optional[List[VisualOverlay]] = Field(None, description="Visual overlay stack")
    motion: Optional[MotionConfig] = Field(None, description="Motion effects config")


class UpdateAudioConfigRequest(BaseModel):
    """Request to update audio playback configuration"""
    duration_seconds: Optional[float] = Field(None, ge=0, description="Track duration in seconds")
    default_volume: Optional[float] = Field(None, ge=0.0, le=1.5, description="Default playback volume")
    default_looping: Optional[bool] = Field(None, description="Default loop behavior")
    effect_eq_enabled: Optional[bool] = Field(None, description="EQ master bypass")
    effect_hpf_enabled: Optional[bool] = Field(None, description="High-pass filter enabled")
    effect_hpf_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="HPF mix level")
    effect_lpf_enabled: Optional[bool] = Field(None, description="Low-pass filter enabled")
    effect_lpf_mix: Optional[float] = Field(None, ge=0.0, le=1.0, description="LPF mix level")
    effect_reverb_enabled: Optional[bool] = Field(None, description="Reverb enabled")
    effect_reverb_mix: Optional[float] = Field(None, ge=0.0, le=1.5, description="Reverb mix level")
    effect_reverb_preset: Optional[str] = Field(None, description="Reverb preset name")
    loop_start: Optional[float] = Field(None, ge=0, description="Loop region start in seconds")
    loop_end: Optional[float] = Field(None, ge=0, description="Loop region end in seconds")
    bpm: Optional[float] = Field(None, gt=0, description="Beats per minute")
    loop_mode: Optional[str] = Field(None, description="Loop mode: off, full, continuous, or region")
    time_signature: Optional[str] = Field(None, description="Time signature: 2/4, 3/4, 4/4, 5/4, 6/8, 7/8, or 12/8")


# Aliases for backwards compatibility
AssetResponse = MediaAssetResponse
AssetListResponse = MediaAssetListResponse


# ── Preset schemas ───────────────────────────────────────────────────────────

class PresetSlotSchema(BaseModel):
    """A single channel → asset assignment within a preset."""
    channel_id: str = Field(..., min_length=1, max_length=64, description="Mixer channel identifier")
    music_asset_id: UUID = Field(..., description="Music asset to load into this channel")

    class Config:
        from_attributes = True  # Auto-hydrate from PresetSlot domain objects


class PresetResponse(BaseModel):
    """A preset (DM-scoped mixer configuration)."""
    # UUID fields mirror the aggregate's types so `model_validate(preset)`
    # works without manual stringification. Pydantic serialises UUIDs as
    # strings in the JSON response, so the wire format matches a bare
    # `str` declaration — but the hydration path is now automatic.
    id: UUID
    user_id: UUID
    name: str
    slots: List[PresetSlotSchema]
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class PresetListResponse(BaseModel):
    """List response wrapper for presets."""
    presets: List[PresetResponse]
    total: int


class CreatePresetRequest(BaseModel):
    """Create a new preset."""
    name: str = Field(..., min_length=1, max_length=64, description="Preset name")
    slots: List[PresetSlotSchema] = Field(default_factory=list, description="Channel slots")


class UpdatePresetRequest(BaseModel):
    """Update an existing preset. Either rename, replace slots, or both."""
    name: Optional[str] = Field(None, min_length=1, max_length=64, description="New name (optional)")
    slots: Optional[List[PresetSlotSchema]] = Field(None, description="New slots (optional)")
