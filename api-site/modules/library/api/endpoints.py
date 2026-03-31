# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset API Endpoints

Provides REST endpoints for media asset management:
- GET /upload-url - Generate presigned S3 upload URL
- POST /confirm - Confirm upload and create media asset record
- GET / - List media assets with optional filters
- POST /{id}/associate - Associate media asset with campaign
- DELETE /{id} - Delete media asset
"""

import logging
from typing import Optional, Union
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from modules.library.dependencies.providers import get_media_asset_repository
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.campaign.dependencies.providers import campaign_repository
from modules.campaign.repositories.campaign_repository import CampaignRepository
from modules.session.dependencies.providers import get_session_repository
from modules.session.repositories.session_repository import SessionRepository
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.application.commands import ConfirmUpload, DeleteMediaAsset, AssociateWithCampaign, RenameMediaAsset, ChangeAssetType, UpdateGridConfig, UpdateAudioConfig, UpdateImageConfig, AssetInUseError
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.music_asset_aggregate import MusicAsset
from modules.library.domain.sfx_asset_aggregate import SfxAsset
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.library.application.queries import GetMediaAssetsByUser, GetMediaAssetsByCampaign
from .schemas import (
    UploadUrlResponse,
    ConfirmUploadRequest,
    MediaAssetResponse,
    MapAssetResponse,
    MusicAssetResponse,
    SfxAssetResponse,
    AssociateRequest,
    RenameRequest,
    ChangeTypeRequest,
    ImageAssetResponse,
    UpdateGridConfigRequest,
    UpdateImageConfigRequest,
    UpdateAudioConfigRequest,
    MediaAssetListResponse
)
from modules.user.domain.user_aggregate import UserAggregate
from shared.dependencies.auth import get_current_user_from_token
from shared.services.s3_service import S3Service, get_s3_service

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_media_asset_response(asset, s3_service: S3Service = None) -> MediaAssetResponse:
    """Convert domain aggregate to API response"""
    s3_url = None
    if s3_service:
        try:
            s3_url = s3_service.generate_download_url(asset.s3_key)
        except Exception as e:
            logger.warning(f"Failed to generate download URL for {asset.s3_key}: {e}")

    # Convert enum to string for JSON response
    asset_type_value = asset.asset_type.value if hasattr(asset.asset_type, 'value') else str(asset.asset_type)

    # If it's a MapAsset, return MapAssetResponse with grid fields
    if isinstance(asset, MapAsset):
        return MapAssetResponse(
            id=str(asset.id),
            user_id=str(asset.user_id),
            filename=asset.filename,
            s3_key=asset.s3_key,
            s3_url=s3_url,
            content_type=asset.content_type,
            asset_type=asset_type_value,
            file_size=asset.file_size,
            campaign_ids=[str(cid) for cid in asset.campaign_ids],

            created_at=asset.created_at,
            updated_at=asset.updated_at,
            grid_width=asset.grid_width,
            grid_height=asset.grid_height,
            grid_opacity=asset.grid_opacity,
            grid_offset_x=asset.grid_offset_x,
            grid_offset_y=asset.grid_offset_y,
            grid_line_color=asset.grid_line_color,
            grid_cell_size=asset.grid_cell_size
        )

    # If it's a MusicAsset, return MusicAssetResponse with audio fields
    if isinstance(asset, MusicAsset):
        return MusicAssetResponse(
            id=str(asset.id),
            user_id=str(asset.user_id),
            filename=asset.filename,
            s3_key=asset.s3_key,
            s3_url=s3_url,
            content_type=asset.content_type,
            asset_type=asset_type_value,
            file_size=asset.file_size,
            campaign_ids=[str(cid) for cid in asset.campaign_ids],

            created_at=asset.created_at,
            updated_at=asset.updated_at,
            duration_seconds=asset.duration_seconds,
            default_volume=asset.default_volume,
            default_looping=asset.default_looping,
            effect_eq_enabled=asset.effect_eq_enabled,
            effect_hpf_enabled=asset.effect_hpf_enabled,
            effect_hpf_mix=asset.effect_hpf_mix,
            effect_lpf_enabled=asset.effect_lpf_enabled,
            effect_lpf_mix=asset.effect_lpf_mix,
            effect_reverb_enabled=asset.effect_reverb_enabled,
            effect_reverb_mix=asset.effect_reverb_mix,
            effect_reverb_preset=asset.effect_reverb_preset
        )

    # If it's a SfxAsset, return SfxAssetResponse with audio fields
    if isinstance(asset, SfxAsset):
        return SfxAssetResponse(
            id=str(asset.id),
            user_id=str(asset.user_id),
            filename=asset.filename,
            s3_key=asset.s3_key,
            s3_url=s3_url,
            content_type=asset.content_type,
            asset_type=asset_type_value,
            file_size=asset.file_size,
            campaign_ids=[str(cid) for cid in asset.campaign_ids],

            created_at=asset.created_at,
            updated_at=asset.updated_at,
            duration_seconds=asset.duration_seconds,
            default_volume=asset.default_volume,
            default_looping=asset.default_looping
        )

    # If it's an ImageAsset, return ImageAssetResponse with display config
    if isinstance(asset, ImageAsset):
        return ImageAssetResponse(
            id=str(asset.id),
            user_id=str(asset.user_id),
            filename=asset.filename,
            s3_key=asset.s3_key,
            s3_url=s3_url,
            content_type=asset.content_type,
            asset_type=asset_type_value,
            file_size=asset.file_size,
            campaign_ids=[str(cid) for cid in asset.campaign_ids],
            created_at=asset.created_at,
            updated_at=asset.updated_at,
            display_mode=asset.display_mode,
            aspect_ratio=asset.aspect_ratio,
            cine_config=asset.cine_config
        )

    return MediaAssetResponse(
        id=str(asset.id),
        user_id=str(asset.user_id),
        filename=asset.filename,
        s3_key=asset.s3_key,
        s3_url=s3_url,
        content_type=asset.content_type,
        asset_type=asset_type_value,
        file_size=asset.file_size,
        campaign_ids=[str(cid) for cid in asset.campaign_ids],
        created_at=asset.created_at,
        updated_at=asset.updated_at
    )


@router.get("/upload-url", response_model=UploadUrlResponse)
async def get_upload_url(
    filename: str = Query(..., description="Original filename"),
    content_type: str = Query(..., description="MIME type (e.g., image/png)"),
    asset_type: MediaAssetType = Query(default=MediaAssetType.MAP, description="Asset type"),
    current_user: UserAggregate = Depends(get_current_user_from_token),
    s3_service: S3Service = Depends(get_s3_service)
) -> UploadUrlResponse:
    """
    Generate a presigned URL for uploading a file directly to S3.

    The client should:
    1. Call this endpoint to get the upload URL
    2. PUT the file to the upload_url
    3. Call POST /confirm with the returned key
    """
    try:
        # Generate unique S3 key
        key = S3Service.generate_key(
            user_id=str(current_user.id),
            filename=filename,
            asset_type=asset_type.value  # Use enum value for S3 key
        )

        # Generate presigned upload URL
        upload_url = s3_service.generate_upload_url(key, content_type)

        logger.info(f"Generated upload URL for user {current_user.id}: {key}")

        return UploadUrlResponse(upload_url=upload_url, key=key)

    except Exception as e:
        logger.error(f"Failed to generate upload URL: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate upload URL")


@router.post("/confirm", response_model=MediaAssetResponse)
async def confirm_upload(
    request: ConfirmUploadRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Confirm that an upload completed and create the media asset record.

    Call this after successfully uploading the file to S3.
    """
    try:
        # Extract filename from key (key format: {asset_type}/{user_id}/{uuid}_{filename})
        key_parts = request.key.split("/")
        if len(key_parts) >= 3:
            filename_part = key_parts[-1]
            # Remove UUID prefix
            if "_" in filename_part:
                filename = filename_part.split("_", 1)[1]
            else:
                filename = filename_part
        else:
            filename = request.key

        # Determine content type from filename extension
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
        content_type_map = {
            "png": "image/png",
            "jpg": "image/jpeg",
            "jpeg": "image/jpeg",
            "webp": "image/webp",
            "gif": "image/gif",
            "mp3": "audio/mpeg",
            "wav": "audio/wav",
            "ogg": "audio/ogg"
        }
        content_type = content_type_map.get(ext, "application/octet-stream")

        command = ConfirmUpload(repo, s3_service)
        asset = command.execute(
            user_id=current_user.id,
            s3_key=request.key,
            filename=filename,
            content_type=content_type,
            asset_type=request.asset_type,
            file_size=request.file_size,
            campaign_id=request.campaign_id
        )

        logger.info(f"Confirmed upload for user {current_user.id}: {asset.id}")

        return _to_media_asset_response(asset, s3_service)

    except ValueError as e:
        logger.warning(f"Confirm upload failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error(f"Confirm upload error: {e}")
        raise HTTPException(status_code=500, detail="Failed to confirm upload")


@router.get("/", response_model=MediaAssetListResponse)
async def list_media_assets(
    campaign_id: Optional[UUID] = Query(None, description="Filter by campaign"),
    asset_type: Optional[MediaAssetType] = Query(None, description="Filter by type"),
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    campaign_repo: CampaignRepository = Depends(campaign_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetListResponse:
    """
    List media assets owned by the current user.

    Optionally filter by campaign and/or asset type.
    """
    try:
        if campaign_id:
            campaign = campaign_repo.get_by_id(campaign_id)
            if not campaign or not campaign.is_member(current_user.id):
                raise HTTPException(status_code=403, detail="Access denied - only campaign members can view campaign assets")
            query = GetMediaAssetsByCampaign(repo)
            assets = query.execute(campaign_id, asset_type)
        else:
            query = GetMediaAssetsByUser(repo)
            assets = query.execute(current_user.id, asset_type)

        return MediaAssetListResponse(
            assets=[_to_media_asset_response(a, s3_service) for a in assets],
            total=len(assets)
        )

    except Exception as e:
        logger.error(f"List media assets error: {e}")
        raise HTTPException(status_code=500, detail="Failed to list media assets")


@router.get("/{asset_id}", response_model=Union[MapAssetResponse, MusicAssetResponse, SfxAssetResponse, MediaAssetResponse])
async def get_media_asset(
    asset_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Get a single media asset by ID with full type-specific fields.
    """
    try:
        asset = repo.get_by_id(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Asset not found")

        if not asset.is_owned_by(current_user.id):
            raise HTTPException(status_code=403, detail="Access denied")

        return _to_media_asset_response(asset, s3_service)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get media asset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to get media asset")


@router.post("/{asset_id}/associate", response_model=MediaAssetResponse)
async def associate_media_asset(
    asset_id: UUID,
    request: AssociateRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Associate a media asset with a campaign.
    """
    try:
        command = AssociateWithCampaign(repo, session_repo)
        asset = command.execute(
            asset_id=asset_id,
            campaign_id=request.campaign_id,
            user_id=current_user.id
        )

        logger.info(f"Associated media asset {asset_id} with campaign {request.campaign_id}")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Associate media asset blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Associate media asset failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Associate media asset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to associate media asset")


@router.patch("/{asset_id}", response_model=MediaAssetResponse)
async def rename_media_asset(
    asset_id: UUID,
    request: RenameRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Rename a media asset's display filename.
    """
    try:
        command = RenameMediaAsset(repo, session_repo)
        asset = command.execute(asset_id, current_user.id, request.filename)

        logger.info(f"Renamed media asset {asset_id} to '{request.filename}'")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Rename media asset blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Rename media asset failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Rename media asset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to rename media asset")


@router.put("/{asset_id}/type", response_model=MediaAssetResponse)
async def change_asset_type(
    asset_id: UUID,
    request: ChangeTypeRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Change a media asset's type tag (e.g. map <-> image).
    """
    try:
        command = ChangeAssetType(repo, session_repo)
        asset = command.execute(asset_id, current_user.id, request.asset_type)

        logger.info(f"Changed media asset {asset_id} type to '{request.asset_type.value}'")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Change asset type blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Change asset type failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Change asset type error: {e}")
        raise HTTPException(status_code=500, detail="Failed to change asset type")


@router.patch("/{asset_id}/grid", response_model=MapAssetResponse)
async def update_grid_config(
    asset_id: UUID,
    request: UpdateGridConfigRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MapAssetResponse:
    """
    Update grid configuration for a map asset.

    Grid config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this map.
    """
    try:
        command = UpdateGridConfig(repo, session_repo)
        asset = command.execute(
            asset_id=asset_id,
            user_id=current_user.id,
            grid_width=request.grid_width,
            grid_height=request.grid_height,
            grid_opacity=request.grid_opacity,
            grid_offset_x=request.grid_offset_x,
            grid_offset_y=request.grid_offset_y,
            grid_line_color=request.grid_line_color,
            grid_cell_size=request.grid_cell_size
        )

        logger.info(f"Updated grid config for map {asset_id}: {asset.get_grid_config()}")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Update grid config blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Update grid config failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update grid config error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update grid configuration")


@router.patch("/{asset_id}/audio-config", response_model=Union[MusicAssetResponse, SfxAssetResponse])
async def update_audio_config(
    asset_id: UUID,
    request: UpdateAudioConfigRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> MediaAssetResponse:
    """
    Update audio configuration for a music or SFX asset.

    Audio config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this audio track.
    """
    try:
        command = UpdateAudioConfig(repo, session_repo)
        asset = command.execute(
            asset_id=asset_id,
            user_id=current_user.id,
            duration_seconds=request.duration_seconds,
            default_volume=request.default_volume,
            default_looping=request.default_looping,
            effect_eq_enabled=request.effect_eq_enabled,
            effect_hpf_enabled=request.effect_hpf_enabled,
            effect_hpf_mix=request.effect_hpf_mix,
            effect_lpf_enabled=request.effect_lpf_enabled,
            effect_lpf_mix=request.effect_lpf_mix,
            effect_reverb_enabled=request.effect_reverb_enabled,
            effect_reverb_mix=request.effect_reverb_mix,
            effect_reverb_preset=request.effect_reverb_preset
        )

        logger.info(f"Updated audio config for asset {asset_id}: {asset.get_audio_config()}")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Update audio config blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Update audio config failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update audio config error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update audio configuration")


@router.patch("/{asset_id}/image-config", response_model=ImageAssetResponse)
async def update_image_config(
    asset_id: UUID,
    request: UpdateImageConfigRequest,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> ImageAssetResponse:
    """
    Update display configuration for an image asset.

    Display config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this image.
    """
    try:
        command = UpdateImageConfig(repo, session_repo)
        asset = command.execute(
            asset_id=asset_id,
            user_id=current_user.id,
            display_mode=request.display_mode,
            aspect_ratio=request.aspect_ratio
        )

        logger.info(f"Updated image config for asset {asset_id}: mode={asset.display_mode}, ratio={asset.aspect_ratio}")

        return _to_media_asset_response(asset, s3_service)

    except AssetInUseError as e:
        logger.warning(f"Update image config blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Update image config failed: {e}")
        raise HTTPException(status_code=400, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Update image config error: {e}")
        raise HTTPException(status_code=500, detail="Failed to update image configuration")


@router.get("/{asset_id}/download-url")
async def get_download_url(
    asset_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    s3_service: S3Service = Depends(get_s3_service)
):
    """
    Get a fresh presigned download URL for a media asset.

    Useful when a previously issued URL has expired during a long game session.
    """
    try:
        asset = repo.get_by_id(asset_id)
        if not asset:
            raise HTTPException(status_code=404, detail="Media asset not found")
        if not asset.is_owned_by(current_user.id):
            raise HTTPException(status_code=403, detail="Access denied")

        download_url = s3_service.generate_download_url(asset.s3_key)
        return {"download_url": download_url}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get download URL error: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate download URL")


@router.delete("/{asset_id}", status_code=204)
async def delete_media_asset(
    asset_id: UUID,
    current_user: UserAggregate = Depends(get_current_user_from_token),
    repo: MediaAssetRepository = Depends(get_media_asset_repository),
    session_repo: SessionRepository = Depends(get_session_repository),
    s3_service: S3Service = Depends(get_s3_service)
) -> None:
    """
    Delete a media asset from S3 and the database.
    """
    try:
        command = DeleteMediaAsset(repo, s3_service, session_repo)
        deleted = command.execute(asset_id, current_user.id)

        if not deleted:
            raise HTTPException(status_code=404, detail="Media asset not found")

        logger.info(f"Deleted media asset {asset_id} for user {current_user.id}")

    except AssetInUseError as e:
        logger.warning(f"Delete media asset blocked (in-use): {e}")
        raise HTTPException(status_code=409, detail=str(e))
    except ValueError as e:
        logger.warning(f"Delete media asset failed: {e}")
        raise HTTPException(status_code=403, detail=str(e))
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Delete media asset error: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete media asset")
