# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset Commands - Write operations for media asset management
"""

from typing import Optional, Union
from uuid import UUID

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.repositories.asset_repository import MediaAssetRepository
from shared.services.s3_service import S3Service


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

        # Create the aggregate
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
    """

    def __init__(self, repository: MediaAssetRepository, s3_service: S3Service):
        self.repository = repository
        self.s3_service = s3_service

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
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            return False

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot delete media asset owned by another user")

        # Delete from S3 first
        self.s3_service.delete_object(asset.s3_key)

        # Then delete from database
        return self.repository.delete(asset_id)


class RenameMediaAsset:
    """
    Rename a media asset's display filename.
    """

    def __init__(self, repository: MediaAssetRepository):
        self.repository = repository

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
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot rename media asset owned by another user")

        asset.rename(new_filename)
        self.repository.save(asset)

        return asset


class ChangeAssetType:
    """
    Change a media asset's type tag (e.g. map <-> image).
    """

    def __init__(self, repository: MediaAssetRepository):
        self.repository = repository

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
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        asset.change_type(new_type)
        self.repository.save(asset)

        return asset


class AssociateWithCampaign:
    """
    Associate a media asset with a campaign (and optionally a session).
    """

    def __init__(self, repository: MediaAssetRepository):
        self.repository = repository

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
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if session_id:
            asset.associate_with_session(session_id, campaign_id)
        else:
            asset.associate_with_campaign(campaign_id)

        self.repository.save(asset)

        return asset
