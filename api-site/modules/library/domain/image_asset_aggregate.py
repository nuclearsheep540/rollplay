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

from shared_contracts.image import ImageConfig

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.cine_config import MotionConfig
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.domain.overlays import Overlay

VALID_IMAGE_FITS = {"float", "wrap", "letterbox"}
VALID_DISPLAY_MODES = {"standard", "cine"}
VALID_ASPECT_RATIOS = {"2.39:1", "1.85:1", "16:9", "4:3", "1:1"}


@dataclass
class ImageAsset(MediaAssetAggregate):
    """
    ImageAsset domain aggregate.

    Extends MediaAssetAggregate with image fit, display mode, and visual effects.
    Config belongs to the image asset, not the session - persists across all uses.
    """
    image_fit: Optional[str] = None           # float / wrap / letterbox
    aspect_ratio: Optional[str] = None
    display_mode: Optional[str] = None        # standard / cine
    image_position_x: Optional[float] = None  # 0–100%
    image_position_y: Optional[float] = None  # 0–100%
    visual_overlays: Optional[list] = None    # list of Overlay dicts
    motion: Optional[MotionConfig] = None

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
        image_fit: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        display_mode: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None,
        visual_overlays: Optional[list] = None,
        motion: Optional[MotionConfig] = None,
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
            image_fit=image_fit,
            aspect_ratio=aspect_ratio,
            display_mode=display_mode,
            image_position_x=image_position_x,
            image_position_y=image_position_y,
            visual_overlays=visual_overlays,
            motion=motion,
        )

    def update_image_config(
        self,
        image_fit: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        display_mode: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None,
    ) -> None:
        """
        Update display configuration.

        Only updates provided values; None values keep current.
        """
        if image_fit is not None:
            if image_fit not in VALID_IMAGE_FITS:
                raise ValueError(f"image_fit must be one of {VALID_IMAGE_FITS}")
            self.image_fit = image_fit

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

        # Clear aspect_ratio if switching away from letterbox
        if image_fit is not None and image_fit != "letterbox":
            self.aspect_ratio = None

        self.updated_at = datetime.utcnow()

    def has_image_config(self) -> bool:
        """Check if image configuration has been set."""
        return self.image_fit is not None

    def build_image_config_for_game(
        self, asset_id: str, filename: str, file_path: str
    ) -> ImageConfig:
        """Build the image config contract for the api-game boundary.

        Includes all config fields. Contract defaults apply when
        domain fields are None.
        """
        from shared_contracts.cine import MotionConfig as MotionConfigContract

        # Convert domain overlays to dicts for contract
        overlays_for_contract = None
        if self.visual_overlays:
            overlays_for_contract = self.visual_overlays  # already list of dicts from JSONB

        # Convert domain motion to contract
        motion_contract = None
        if self.motion:
            motion_contract = MotionConfigContract.model_validate(self.motion.to_dict())

        return ImageConfig(
            asset_id=asset_id,
            filename=filename,
            original_filename=self.filename,
            file_path=file_path,
            image_fit=self.image_fit or "float",
            display_mode=self.display_mode or "standard",
            aspect_ratio=self.aspect_ratio,
            image_position_x=self.image_position_x,
            image_position_y=self.image_position_y,
            visual_overlays=overlays_for_contract,
            motion=motion_contract,
        )

    def update_image_config_from_game(
        self,
        image_fit: Optional[str] = None,
        display_mode: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None,
    ) -> None:
        """Update domain fields from api-game state.

        The inverse of build_image_config_for_game(). Used during
        session end ETL to sync runtime changes back to PostgreSQL.
        Does NOT touch visual_overlays or motion (workshop-authored).
        """
        self.update_image_config(
            image_fit=image_fit,
            display_mode=display_mode,
            aspect_ratio=aspect_ratio,
            image_position_x=image_position_x,
            image_position_y=image_position_y,
        )
