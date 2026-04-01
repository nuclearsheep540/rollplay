# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
ImageAsset Aggregate - Domain model for image display assets

Extends MediaAssetAggregate with display configuration fields (display_mode, aspect_ratio).
Display config is stored on the asset itself, making it reusable across campaigns.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import Optional
from uuid import UUID, uuid4

from shared_contracts.cine import CineConfig as CineConfigContract
from shared_contracts.image import ImageConfig

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.cine_config import CineConfig
from modules.library.domain.media_asset_type import MediaAssetType

VALID_DISPLAY_MODES = {"float", "wrap", "letterbox", "cine"}
VALID_ASPECT_RATIOS = {"2.39:1", "1.85:1", "16:9", "4:3", "1:1"}


@dataclass
class ImageAsset(MediaAssetAggregate):
    """
    ImageAsset domain aggregate.

    Extends MediaAssetAggregate with display configuration fields.
    Display config belongs to the image asset, not the session - so it persists
    across all uses of this image in any campaign/session.
    """
    display_mode: Optional[str] = None
    aspect_ratio: Optional[str] = None
    image_position_x: Optional[float] = None  # 0–100%, position of image within frame
    image_position_y: Optional[float] = None  # 0–100%, position of image within frame
    cine_config: Optional[CineConfig] = None  # Workshop-authored, read-only at runtime

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
            created_at=datetime.utcnow(),
            updated_at=None
        )

    @classmethod
    def from_base(
        cls,
        base: MediaAssetAggregate,
        display_mode: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None,
        cine_config: Optional[CineConfig] = None
    ) -> "ImageAsset":
        """
        Promote a base MediaAssetAggregate to ImageAsset.

        Used when repository loads from joined tables.
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
            created_at=base.created_at,
            updated_at=base.updated_at,
            display_mode=display_mode,
            aspect_ratio=aspect_ratio,
            image_position_x=image_position_x,
            image_position_y=image_position_y,
            cine_config=cine_config
        )

    def update_image_config(
        self,
        display_mode: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None
    ) -> None:
        """
        Update display configuration.

        Only updates provided values; None values keep current.
        """
        if display_mode is not None:
            if display_mode not in VALID_DISPLAY_MODES:
                raise ValueError(f"display_mode must be one of {VALID_DISPLAY_MODES}")
            self.display_mode = display_mode

        if aspect_ratio is not None:
            if aspect_ratio not in VALID_ASPECT_RATIOS:
                raise ValueError(f"aspect_ratio must be one of {VALID_ASPECT_RATIOS}")
            self.aspect_ratio = aspect_ratio

        if image_position_x is not None:
            if not 0.0 <= image_position_x <= 100.0:
                raise ValueError("image_position_x must be between 0 and 100")
            self.image_position_x = image_position_x

        if image_position_y is not None:
            if not 0.0 <= image_position_y <= 100.0:
                raise ValueError("image_position_y must be between 0 and 100")
            self.image_position_y = image_position_y

        # Clear aspect_ratio if switching away from letterbox/cine
        if display_mode is not None and display_mode not in ("letterbox", "cine"):
            self.aspect_ratio = None

        self.updated_at = datetime.utcnow()

    def has_image_config(self) -> bool:
        """Check if display configuration has been set."""
        return self.display_mode is not None

    def build_image_config_for_game(
        self, asset_id: str, filename: str, file_path: str
    ) -> ImageConfig:
        """Build the image config contract for the api-game boundary.

        Includes display config fields. Contract defaults apply when
        domain fields are None.
        """
        # Convert domain CineConfig to contract CineConfig for ETL
        cine_contract = None
        if self.cine_config:
            cine_contract = CineConfigContract.model_validate(self.cine_config.to_dict())

        return ImageConfig(
            asset_id=asset_id,
            filename=filename,
            original_filename=self.filename,
            file_path=file_path,
            display_mode=self.display_mode or "float",
            aspect_ratio=self.aspect_ratio,
            image_position_x=self.image_position_x,
            image_position_y=self.image_position_y,
            cine_config=cine_contract,
        )

    def update_image_config_from_game(
        self,
        display_mode: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None
    ) -> None:
        """Update domain fields from api-game state.

        The inverse of build_image_config_for_game(). Used during
        session end ETL to sync runtime changes back to PostgreSQL.
        Does NOT touch cine_config (workshop-authored, read-only at runtime).
        """
        self.update_image_config(
            display_mode=display_mode,
            aspect_ratio=aspect_ratio,
            image_position_x=image_position_x,
            image_position_y=image_position_y,
        )
