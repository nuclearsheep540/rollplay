# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset Commands - Write operations for media asset management
"""

from typing import Optional, Union
from uuid import UUID

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.music_asset_aggregate import MusicAsset
from modules.library.domain.sfx_asset_aggregate import SfxAsset
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.session.repositories.session_repository import SessionRepository
from modules.session.domain.session_aggregate import SessionStatus
from shared.services.s3_service import S3Service


class AssetInUseError(Exception):
    """Raised when an asset cannot be modified because it is in use by an active session."""
    pass


def check_asset_in_active_session(campaign_ids, session_repository):
    """Raise AssetInUseError if asset belongs to a campaign with an in-flight session."""
    for campaign_id in (campaign_ids or []):
        sessions = session_repository.get_by_campaign_id(campaign_id)
        for session in sessions:
            if session.status in (SessionStatus.ACTIVE, SessionStatus.STARTING, SessionStatus.STOPPING):
                raise AssetInUseError(
                    "Cannot modify asset while a session is active in campaign. "
                    "Please pause or finish the session first."
                )


class ConfirmUpload:
    """
    Confirm that an upload to S3 completed and create the media asset record.

    This is called after the client successfully uploads a file to S3
    using the presigned URL.
    """

    def __init__(self, repository: MediaAssetRepository, s3_service: S3Service):
        self.repository = repository
        self.s3_service = s3_service

    def execute(
        self,
        user_id: UUID,
        s3_key: str,
        filename: str,
        content_type: str,
        asset_type: Union[MediaAssetType, str],
        file_size: Optional[int] = None,
        campaign_id: Optional[UUID] = None
    ) -> MediaAssetAggregate:
        """
        Confirm upload and create media asset record.

        Args:
            user_id: The uploading user's ID
            s3_key: The S3 object key from upload
            filename: Original filename
            content_type: MIME type
            asset_type: Type of asset (MediaAssetType enum or string)
            file_size: Optional file size in bytes
            campaign_id: Optional campaign to associate with

        Returns:
            Created MediaAssetAggregate
        """
        # Check if asset with this key already exists
        existing = self.repository.get_by_s3_key(s3_key)
        if existing:
            raise ValueError(f"Media asset with key {s3_key} already exists")

        # Optionally verify the object exists in S3
        if not self.s3_service.object_exists(s3_key):
            raise ValueError(f"Object {s3_key} not found in S3")

        # Convert string to enum if needed
        if isinstance(asset_type, str):
            asset_type = MediaAssetType(asset_type)

        # Create the appropriate aggregate based on type
        if asset_type == MediaAssetType.MAP:
            asset = MapAsset.create(
                user_id=user_id,
                filename=filename,
                s3_key=s3_key,
                content_type=content_type,
                file_size=file_size,
                campaign_id=campaign_id
            )
        elif asset_type == MediaAssetType.MUSIC:
            asset = MusicAsset.create(
                user_id=user_id,
                filename=filename,
                s3_key=s3_key,
                content_type=content_type,
                file_size=file_size,
                campaign_id=campaign_id
            )
        elif asset_type == MediaAssetType.SFX:
            asset = SfxAsset.create(
                user_id=user_id,
                filename=filename,
                s3_key=s3_key,
                content_type=content_type,
                file_size=file_size,
                campaign_id=campaign_id
            )
        elif asset_type == MediaAssetType.IMAGE:
            asset = ImageAsset.create(
                user_id=user_id,
                filename=filename,
                s3_key=s3_key,
                content_type=content_type,
                file_size=file_size,
                campaign_id=campaign_id
            )
        else:
            asset = MediaAssetAggregate.create(
                user_id=user_id,
                filename=filename,
                s3_key=s3_key,
                content_type=content_type,
                asset_type=asset_type,
                file_size=file_size,
                campaign_id=campaign_id
            )

        # Persist
        self.repository.save(asset)

        return asset


class DeleteMediaAsset:
    """
    Delete a media asset from both S3 and the database.

    Guards:
    - Blocks deletion if any session in the asset's campaigns is in-flight
    - Cleans stale references from inactive/finished session JSONB configs
    """

    def __init__(self, repository: MediaAssetRepository, s3_service: S3Service, session_repository: SessionRepository):
        self.repository = repository
        self.s3_service = s3_service
        self.session_repository = session_repository

    def execute(self, asset_id: UUID, user_id: UUID) -> bool:
        """
        Delete media asset if owned by the user.

        Args:
            asset_id: The asset to delete
            user_id: The requesting user's ID

        Returns:
            True if deleted, False if not found

        Raises:
            ValueError: If asset is not owned by user
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            return False

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot delete media asset owned by another user")

        # Guard: block deletion if any campaign session is in-flight
        check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        # Cleanup: scrub stale references from inactive/finished session configs
        asset_id_str = str(asset_id)
        for campaign_id in (asset.campaign_ids or []):
            sessions = self.session_repository.get_by_campaign_id(campaign_id)
            for session in sessions:
                if session.remove_asset_references(asset_id_str):
                    self.session_repository.save(session)

        # Delete from S3 first
        self.s3_service.delete_object(asset.s3_key)

        # Then delete from database
        return self.repository.delete(asset_id)


class RenameMediaAsset:
    """
    Rename a media asset's display filename.
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(self, asset_id: UUID, user_id: UUID, new_filename: str) -> MediaAssetAggregate:
        """
        Rename asset if owned by the user.

        Args:
            asset_id: The asset to rename
            user_id: The requesting user's ID
            new_filename: The new display filename

        Returns:
            Updated MediaAssetAggregate

        Raises:
            ValueError: If asset not found or not owned by user
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot rename media asset owned by another user")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        asset.rename(new_filename)
        self.repository.save(asset)

        return asset


class ChangeAssetType:
    """
    Change a media asset's type tag (e.g. map <-> image).
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(self, asset_id: UUID, user_id: UUID, new_type: Union[MediaAssetType, str]) -> MediaAssetAggregate:
        """
        Change asset type if owned by the user.

        Args:
            asset_id: The asset to change
            user_id: The requesting user's ID
            new_type: The new asset type

        Returns:
            Updated MediaAssetAggregate

        Raises:
            ValueError: If asset not found, not owned by user, or invalid type change
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        asset.change_type(new_type)
        self.repository.save(asset)

        return asset


class AssociateWithCampaign:
    """
    Associate a media asset with a campaign (and optionally a session).
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        asset_id: UUID,
        campaign_id: UUID,
        user_id: UUID,
        session_id: Optional[UUID] = None
    ) -> MediaAssetAggregate:
        """
        Associate media asset with campaign/session.

        Args:
            asset_id: The asset to associate
            campaign_id: The campaign to associate with
            user_id: The requesting user's ID
            session_id: Optional session to associate with

        Returns:
            Updated MediaAssetAggregate

        Raises:
            ValueError: If asset not found or not owned by user
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        if session_id:
            asset.associate_with_session(session_id, campaign_id)
        else:
            asset.associate_with_campaign(campaign_id)

        self.repository.save(asset)

        return asset


class UpdateGridConfig:
    """
    Update grid configuration for a map asset.

    Grid config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this map.
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        asset_id: UUID,
        user_id: UUID,
        grid_width: Optional[int] = None,
        grid_height: Optional[int] = None,
        grid_opacity: Optional[float] = None
    ) -> MapAsset:
        """
        Update grid configuration for a map asset.

        Args:
            asset_id: The map asset to update
            user_id: The requesting user's ID
            grid_width: Grid width in cells (1-100)
            grid_height: Grid height in cells (1-100)
            grid_opacity: Grid overlay opacity (0.0-1.0)

        Returns:
            Updated MapAsset

        Raises:
            ValueError: If asset not found, not owned, or not a map
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if not isinstance(asset, MapAsset):
            raise ValueError("Grid configuration only applies to map assets")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        asset.update_grid_config(
            grid_width=grid_width,
            grid_height=grid_height,
            grid_opacity=grid_opacity
        )

        self.repository.save(asset)
        return asset


class UpdateAudioConfig:
    """
    Update audio configuration for a music or SFX asset.

    Audio config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this track.
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        asset_id: UUID,
        user_id: UUID,
        duration_seconds: Optional[float] = None,
        default_volume: Optional[float] = None,
        default_looping: Optional[bool] = None
    ) -> Union[MusicAsset, SfxAsset]:
        """
        Update audio configuration for an audio asset.

        Args:
            asset_id: The audio asset to update
            user_id: The requesting user's ID
            duration_seconds: Track duration in seconds (>= 0)
            default_volume: Default playback volume (0.0-1.3)
            default_looping: Default loop behavior

        Returns:
            Updated MusicAsset or SfxAsset

        Raises:
            ValueError: If asset not found, not owned, or not an audio asset
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if not isinstance(asset, (MusicAsset, SfxAsset)):
            raise ValueError("Audio configuration only applies to music and SFX assets")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        asset.update_audio_config(
            duration_seconds=duration_seconds,
            default_volume=default_volume,
            default_looping=default_looping
        )

        self.repository.save(asset)
        return asset
