# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
ImageAsset Aggregate - Domain model for image display assets

Extends MediaAssetAggregate as a typed aggregate for IMAGE assets.
Currently has no extra fields — exists for pattern consistency with
MapAsset, MusicAsset, and SfxAsset, so every asset type has a discoverable aggregate.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.media_asset_type import MediaAssetType


@dataclass
class ImageAsset(MediaAssetAggregate):
    """
    ImageAsset domain aggregate.

    Represents a plain image asset (non-map). Currently identical to
    MediaAssetAggregate in fields — the typed aggregate ensures IMAGE
    assets follow the same pattern as MAP, MUSIC, and SFX.
    """

    @classmethod
    def create(
        cls,
        user_id: UUID,
        filename: str,
        s3_key: str,
        content_type: str,
        file_size: Optional[int] = None,
        campaign_id: Optional[UUID] = None
    ) -> "ImageAsset":
        """
        Factory method to create a new image asset.

        Forces asset_type to IMAGE. Validates content_type is an image format.
        """
        valid_image_types = {"image/png", "image/jpeg", "image/webp", "image/gif"}
        if content_type not in valid_image_types:
            raise ValueError(f"Invalid content_type for image: {content_type}")

        campaign_ids = [campaign_id] if campaign_id else []

        return cls(
            id=uuid4(),
            user_id=user_id,
            filename=filename,
            s3_key=s3_key,
            content_type=content_type,
            asset_type=MediaAssetType.IMAGE,
            file_size=file_size,
            campaign_ids=campaign_ids,
            session_ids=[],
            created_at=datetime.utcnow(),
            updated_at=None
        )

    @classmethod
    def from_base(cls, base: MediaAssetAggregate) -> "ImageAsset":
        """
        Promote a base MediaAssetAggregate to ImageAsset.

        Used when repository loads from the database.
        """
        return cls(
            id=base.id,
            user_id=base.user_id,
            filename=base.filename,
            s3_key=base.s3_key,
            content_type=base.content_type,
            asset_type=base.asset_type,
            file_size=base.file_size,
            campaign_ids=base.campaign_ids,
            session_ids=base.session_ids,
            created_at=base.created_at,
            updated_at=base.updated_at
        )
