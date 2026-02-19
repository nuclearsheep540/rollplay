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
    """Request to associate a media asset with a campaign/session"""
    campaign_id: UUID = Field(..., description="Campaign to associate with")
    session_id: Optional[UUID] = Field(None, description="Session to associate with (optional)")


class RenameRequest(BaseModel):
    """Request to rename a media asset"""
    filename: str = Field(..., min_length=1, max_length=255, description="New display filename")


class ChangeTypeRequest(BaseModel):
    """Request to change a media asset's type tag"""
    asset_type: MediaAssetType = Field(..., description="New asset type (map, image, music, sfx)")


class MediaAssetResponse(BaseModel):
    """Response containing media asset details"""
    id: str
    user_id: str
    filename: str
    s3_key: str
    s3_url: Optional[str] = None  # Presigned download URL (generated on demand)
    content_type: str
    asset_type: str  # Return as string for JSON compatibility
    file_size: Optional[int] = None
    campaign_ids: List[str] = []
    session_ids: List[str] = []
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class MediaAssetListResponse(BaseModel):
    """Response containing list of media assets"""
    assets: List[MediaAssetResponse]
    total: int


class UpdateGridConfigRequest(BaseModel):
    """Request to update map grid configuration"""
    grid_width: Optional[int] = Field(None, ge=1, le=100, description="Grid width in cells")
    grid_height: Optional[int] = Field(None, ge=1, le=100, description="Grid height in cells")
    grid_opacity: Optional[float] = Field(None, ge=0.0, le=1.0, description="Grid overlay opacity")


class MapAssetResponse(MediaAssetResponse):
    """Response containing map asset details with grid config"""
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None
    grid_opacity: Optional[float] = None


class MusicAssetResponse(MediaAssetResponse):
    """Response containing music asset details with playback config"""
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None


class SfxAssetResponse(MediaAssetResponse):
    """Response containing SFX asset details with playback config"""
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None


class UpdateAudioConfigRequest(BaseModel):
    """Request to update audio playback configuration"""
    duration_seconds: Optional[float] = Field(None, ge=0, description="Track duration in seconds")
    default_volume: Optional[float] = Field(None, ge=0.0, le=1.3, description="Default playback volume")
    default_looping: Optional[bool] = Field(None, description="Default loop behavior")


# Aliases for backwards compatibility
AssetResponse = MediaAssetResponse
AssetListResponse = MediaAssetListResponse
