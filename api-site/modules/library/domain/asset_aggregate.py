# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset Aggregate - Domain model for S3-backed media files

Represents a media asset (map, music, sfx, image) in the DM's library.
Media assets are owned by users and can be associated with campaigns/sessions.

This is distinct from domain objects (NPCs, Items) which have business logic
but no S3 backing.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import List, Optional, Union
from uuid import UUID, uuid4

from modules.library.domain.media_asset_type import MediaAssetType


@dataclass
class MediaAssetAggregate:
    """
    MediaAsset domain aggregate.

    Represents a media file's metadata and associations.
    The actual file is stored in S3, referenced by s3_key.
    """
    id: Optional[UUID]
    user_id: UUID
    filename: str
    s3_key: str
    content_type: str
    asset_type: MediaAssetType
    file_size: Optional[int] = None
    campaign_ids: List[UUID] = field(default_factory=list)
    session_ids: List[UUID] = field(default_factory=list)
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def create(
        cls,
        user_id: UUID,
        filename: str,
        s3_key: str,
        content_type: str,
        asset_type: Union[MediaAssetType, str],
        file_size: Optional[int] = None,
        campaign_id: Optional[UUID] = None
    ) -> "MediaAssetAggregate":
        """
        Factory method to create a new media asset.

        Args:
            user_id: The owning user's ID
            filename: Original filename
            s3_key: S3 object key
            content_type: MIME type
            asset_type: Type of asset (MediaAssetType enum or string)
            file_size: Optional file size in bytes
            campaign_id: Optional campaign to associate with

        Returns:
            New MediaAssetAggregate instance
        """
        # Convert string to enum if needed
        if isinstance(asset_type, str):
            try:
                asset_type = MediaAssetType(asset_type)
            except ValueError:
                valid_types = [t.value for t in MediaAssetType]
                raise ValueError(f"Invalid asset_type: {asset_type}. Must be one of {valid_types}")

        # Validate content type for maps
        if asset_type == MediaAssetType.MAP:
            valid_map_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
            if content_type not in valid_map_types:
                raise ValueError(f"Invalid content_type for map: {content_type}")

        campaign_ids = [campaign_id] if campaign_id else []

        return cls(
            id=uuid4(),
            user_id=user_id,
            filename=filename,
            s3_key=s3_key,
            content_type=content_type,
            asset_type=asset_type,
            file_size=file_size,
            campaign_ids=campaign_ids,
            session_ids=[],
            created_at=datetime.utcnow(),
            updated_at=None
        )

    def associate_with_campaign(self, campaign_id: UUID) -> None:
        """
        Associate this asset with a campaign.

        Args:
            campaign_id: The campaign to associate with
        """
        if campaign_id not in self.campaign_ids:
            self.campaign_ids.append(campaign_id)
            self.updated_at = datetime.utcnow()

    def disassociate_from_campaign(self, campaign_id: UUID) -> None:
        """
        Remove association with a campaign.

        Args:
            campaign_id: The campaign to disassociate from
        """
        if campaign_id in self.campaign_ids:
            self.campaign_ids.remove(campaign_id)
            self.updated_at = datetime.utcnow()

    def associate_with_session(self, session_id: UUID, campaign_id: UUID) -> None:
        """
        Associate this asset with a session.
        Also associates with the session's campaign (inheritance rule).

        Args:
            session_id: The session to associate with
            campaign_id: The session's parent campaign
        """
        if session_id not in self.session_ids:
            self.session_ids.append(session_id)
            self.updated_at = datetime.utcnow()

        # Ensure campaign association (inheritance rule)
        self.associate_with_campaign(campaign_id)

    def change_type(self, new_type: "MediaAssetType") -> None:
        """
        Change this asset's type tag with content-type validation.

        Valid transitions:
        - image content types (png, jpeg, webp, gif) → map or image
        - audio content types (mpeg, wav, ogg) → music or sfx

        Args:
            new_type: The new asset type

        Raises:
            ValueError: If the content type is incompatible with the new type
        """
        if isinstance(new_type, str):
            new_type = MediaAssetType(new_type)

        image_content_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
        audio_content_types = {"audio/mpeg", "audio/wav", "audio/ogg"}

        if new_type in (MediaAssetType.MAP, MediaAssetType.IMAGE) and self.content_type not in image_content_types:
            raise ValueError(f"Cannot change to {new_type.value}: content type {self.content_type} is not an image")
        if new_type in (MediaAssetType.MUSIC, MediaAssetType.SFX) and self.content_type not in audio_content_types:
            raise ValueError(f"Cannot change to {new_type.value}: content type {self.content_type} is not audio")

        self.asset_type = new_type
        self.updated_at = datetime.utcnow()

    def rename(self, new_filename: str) -> None:
        """
        Rename this asset.

        Args:
            new_filename: The new display filename
        """
        if not new_filename or not new_filename.strip():
            raise ValueError("Filename cannot be empty")
        self.filename = new_filename.strip()
        self.updated_at = datetime.utcnow()

    def is_owned_by(self, user_id: UUID) -> bool:
        """Check if asset is owned by the given user."""
        return self.user_id == user_id

    def is_associated_with_campaign(self, campaign_id: UUID) -> bool:
        """Check if asset is associated with the given campaign."""
        return campaign_id in self.campaign_ids
