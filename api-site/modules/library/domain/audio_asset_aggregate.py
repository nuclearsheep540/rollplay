# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
AudioAsset Aggregate - Domain model for audio assets with playback configuration

Extends MediaAssetAggregate with audio-specific fields (duration, volume, looping).
MUSIC and SFX assets share this aggregate — differentiated by asset_type.
"""

from dataclasses import dataclass
from datetime import datetime
from typing import List, Optional, Union
from uuid import UUID, uuid4

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.media_asset_type import MediaAssetType


@dataclass
class AudioAsset(MediaAssetAggregate):
    """
    AudioAsset domain aggregate.

    Extends MediaAssetAggregate with audio playback configuration fields.
    These are asset-level defaults that persist across sessions — when a DM
    loads this track into a game, these values are used as starting config.

    Used for both MUSIC (BGM) and SFX asset types.
    """
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None

    @classmethod
    def create(
        cls,
        user_id: UUID,
        filename: str,
        s3_key: str,
        content_type: str,
        asset_type: Union[MediaAssetType, str] = MediaAssetType.MUSIC,
        file_size: Optional[int] = None,
        campaign_id: Optional[UUID] = None,
        duration_seconds: Optional[float] = None,
        default_volume: Optional[float] = None,
        default_looping: Optional[bool] = None
    ) -> "AudioAsset":
        """
        Factory method to create a new audio asset.

        Validates content_type is audio and asset_type is MUSIC or SFX.
        """
        # Convert string to enum if needed
        if isinstance(asset_type, str):
            asset_type = MediaAssetType(asset_type)

        # Validate asset type
        if asset_type not in (MediaAssetType.MUSIC, MediaAssetType.SFX):
            raise ValueError(f"AudioAsset must be MUSIC or SFX type, got {asset_type.value}")

        # Validate content type for audio
        valid_audio_types = {"audio/mpeg", "audio/wav", "audio/ogg"}
        if content_type not in valid_audio_types:
            raise ValueError(f"Invalid content_type for audio: {content_type}")

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
            updated_at=None,
            duration_seconds=duration_seconds,
            default_volume=default_volume,
            default_looping=default_looping
        )

    @classmethod
    def from_base(
        cls,
        base: MediaAssetAggregate,
        duration_seconds: Optional[float] = None,
        default_volume: Optional[float] = None,
        default_looping: Optional[bool] = None
    ) -> "AudioAsset":
        """
        Promote a base MediaAssetAggregate to AudioAsset.

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
            session_ids=base.session_ids,
            created_at=base.created_at,
            updated_at=base.updated_at,
            duration_seconds=duration_seconds,
            default_volume=default_volume,
            default_looping=default_looping
        )

    def update_audio_config(
        self,
        duration_seconds: Optional[float] = None,
        default_volume: Optional[float] = None,
        default_looping: Optional[bool] = None
    ) -> None:
        """
        Update audio configuration.

        Only updates provided values; None values keep current.
        """
        if duration_seconds is not None:
            if duration_seconds < 0:
                raise ValueError("duration_seconds must be >= 0")
            self.duration_seconds = duration_seconds

        if default_volume is not None:
            if not 0.0 <= default_volume <= 1.3:
                raise ValueError("default_volume must be between 0.0 and 1.3")
            self.default_volume = default_volume

        if default_looping is not None:
            self.default_looping = default_looping

        self.updated_at = datetime.utcnow()

    def has_audio_config(self) -> bool:
        """Check if any audio-specific configuration has been set."""
        return (
            self.duration_seconds is not None
            or self.default_volume is not None
            or self.default_looping is not None
        )

    def get_audio_config(self) -> dict:
        """Return audio config as a dict for API responses and ETL."""
        return {
            "duration_seconds": self.duration_seconds,
            "default_volume": self.default_volume,
            "default_looping": self.default_looping
        }
