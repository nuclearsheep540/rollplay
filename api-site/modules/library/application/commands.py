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
from modules.library.domain.cine_config import MotionConfig as DomainMotionConfig
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.repositories.preset_repository import PresetRepository
from modules.library.domain.preset_aggregate import PresetAggregate, PresetSlot
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
    Associate a media asset with a campaign.
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        asset_id: UUID,
        campaign_id: UUID,
        user_id: UUID
    ) -> MediaAssetAggregate:
        """
        Associate media asset with campaign.

        Args:
            asset_id: The asset to associate
            campaign_id: The campaign to associate with
            user_id: The requesting user's ID

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
        grid_opacity: Optional[float] = None,
        grid_offset_x: Optional[int] = None,
        grid_offset_y: Optional[int] = None,
        grid_line_color: Optional[str] = None,
        grid_cell_size: Optional[float] = None
    ) -> MapAsset:
        """
        Update grid configuration for a map asset.

        Args:
            asset_id: The map asset to update
            user_id: The requesting user's ID
            grid_width: Grid width in cells (1-1000)
            grid_height: Grid height in cells (1-1000)
            grid_opacity: Grid overlay opacity (0.0-1.0)
            grid_offset_x: Whole-grid X shift (image px)
            grid_offset_y: Whole-grid Y shift (image px)
            grid_line_color: Grid line colour hex string
            grid_cell_size: Cell size in native image pixels (8-500)

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
            grid_opacity=grid_opacity,
            grid_offset_x=grid_offset_x,
            grid_offset_y=grid_offset_y,
            grid_line_color=grid_line_color,
            grid_cell_size=grid_cell_size
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
        default_looping: Optional[bool] = None,
        effect_eq_enabled: Optional[bool] = None,
        effect_hpf_enabled: Optional[bool] = None,
        effect_hpf_mix: Optional[float] = None,
        effect_lpf_enabled: Optional[bool] = None,
        effect_lpf_mix: Optional[float] = None,
        effect_reverb_enabled: Optional[bool] = None,
        effect_reverb_mix: Optional[float] = None,
        effect_reverb_preset: Optional[str] = None,
        loop_start: Optional[float] = None,
        loop_end: Optional[float] = None,
        bpm: Optional[float] = None,
        loop_mode: Optional[str] = None
    ) -> Union[MusicAsset, SfxAsset]:
        """
        Update audio configuration for an audio asset.

        Args:
            asset_id: The audio asset to update
            user_id: The requesting user's ID
            duration_seconds: Track duration in seconds (>= 0)
            default_volume: Default playback volume (0.0-1.3)
            default_looping: Default loop behavior
            effect_*: Effect configuration fields (MusicAsset only)

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

        # Build kwargs — effects only apply to MusicAsset
        config_kwargs = dict(
            duration_seconds=duration_seconds,
            default_volume=default_volume,
            default_looping=default_looping,
        )
        if isinstance(asset, MusicAsset):
            config_kwargs.update(
                effect_eq_enabled=effect_eq_enabled,
                effect_hpf_enabled=effect_hpf_enabled,
                effect_hpf_mix=effect_hpf_mix,
                effect_lpf_enabled=effect_lpf_enabled,
                effect_lpf_mix=effect_lpf_mix,
                effect_reverb_enabled=effect_reverb_enabled,
                effect_reverb_mix=effect_reverb_mix,
                effect_reverb_preset=effect_reverb_preset,
                loop_start=loop_start,
                loop_end=loop_end,
                bpm=bpm,
                loop_mode=loop_mode,
            )

        asset.update_audio_config(**config_kwargs)

        self.repository.save(asset)
        return asset


class UpdateImageConfig:
    """
    Update display configuration for an image asset.

    Display config is stored on the asset itself, making it reusable
    across all campaigns/sessions that use this image.
    """

    def __init__(self, repository: MediaAssetRepository, session_repository: SessionRepository = None):
        self.repository = repository
        self.session_repository = session_repository

    def execute(
        self,
        asset_id: UUID,
        user_id: UUID,
        image_fit: Optional[str] = None,
        aspect_ratio: Optional[str] = None,
        display_mode: Optional[str] = None,
        image_position_x: Optional[float] = None,
        image_position_y: Optional[float] = None,
        visual_overlays="UNSET",
        motion="UNSET",
    ) -> ImageAsset:
        """
        Update image configuration.

        Returns:
            Updated ImageAsset

        Raises:
            ValueError: If asset not found, not owned, or not an image
            AssetInUseError: If asset is in an active session
        """
        asset = self.repository.get_by_id(asset_id)
        if not asset:
            raise ValueError(f"Media asset {asset_id} not found")

        if not asset.is_owned_by(user_id):
            raise ValueError("Cannot modify media asset owned by another user")

        if not isinstance(asset, ImageAsset):
            raise ValueError("Image configuration only applies to image assets")

        if self.session_repository:
            check_asset_in_active_session(asset.campaign_ids, self.session_repository)

        asset.update_image_config(
            image_fit=image_fit,
            display_mode=display_mode,
            aspect_ratio=aspect_ratio,
            image_position_x=image_position_x,
            image_position_y=image_position_y,
        )

        if visual_overlays != "UNSET":
            asset.visual_overlays = visual_overlays
            # updated_at already set by update_image_config() above

        if motion != "UNSET":
            if motion is not None:
                domain_motion = DomainMotionConfig.from_dict(motion)
                domain_motion.validate()
                asset.motion = domain_motion
            else:
                asset.motion = None

        self.repository.save(asset)
        return asset


class PresetNameConflictError(Exception):
    """Raised when a preset name is already taken by the same user."""
    pass


class PresetNotFoundError(Exception):
    """Raised when a preset cannot be found or does not belong to the requester."""
    pass


class InvalidPresetAssetError(Exception):
    """Raised when a preset slot references an asset that doesn't exist or isn't a music asset."""
    pass


def _validate_preset_slots(
    slots: list,
    user_id: UUID,
    asset_repository: MediaAssetRepository,
) -> list:
    """
    Resolve and validate a list of PresetSlot entries: every referenced asset
    must exist, belong to the user, and be a music asset.
    """
    validated: list = []
    for slot in slots:
        asset = asset_repository.get_by_id(slot.music_asset_id)
        if not asset:
            raise InvalidPresetAssetError(f"Music asset {slot.music_asset_id} not found")
        if asset.user_id != user_id:
            raise InvalidPresetAssetError(f"Asset {slot.music_asset_id} is not owned by user")
        # Accept MusicAsset subtype (polymorphic load returns the right type)
        if not isinstance(asset, MusicAsset):
            raise InvalidPresetAssetError(
                f"Asset {slot.music_asset_id} is not a music asset"
            )
        validated.append(slot)
    return validated


class CreatePreset:
    """Create a new preset for a user."""

    def __init__(
        self,
        preset_repository: PresetRepository,
        asset_repository: MediaAssetRepository,
    ):
        self.presets = preset_repository
        self.assets = asset_repository

    def execute(
        self,
        user_id: UUID,
        name: str,
        slots: list,
    ) -> PresetAggregate:
        validated_slots = _validate_preset_slots(slots, user_id, self.assets)
        preset = PresetAggregate.create(user_id=user_id, name=name, slots=validated_slots)

        if self.presets.name_exists_for_user(user_id, preset.name):
            raise PresetNameConflictError(
                f"A preset named '{preset.name}' already exists"
            )

        return self.presets.save(preset)


class RenamePreset:
    """Rename an existing preset."""

    def __init__(self, preset_repository: PresetRepository):
        self.presets = preset_repository

    def execute(self, preset_id: UUID, user_id: UUID, name: str) -> PresetAggregate:
        preset = self.presets.get_by_id(preset_id)
        if not preset or preset.user_id != user_id:
            raise PresetNotFoundError(f"Preset {preset_id} not found")

        preset.rename(name)
        if self.presets.name_exists_for_user(user_id, preset.name, exclude_id=preset.id):
            raise PresetNameConflictError(
                f"A preset named '{preset.name}' already exists"
            )
        return self.presets.save(preset)


class UpdatePresetSlots:
    """Bulk replace the slot list on an existing preset."""

    def __init__(
        self,
        preset_repository: PresetRepository,
        asset_repository: MediaAssetRepository,
    ):
        self.presets = preset_repository
        self.assets = asset_repository

    def execute(
        self,
        preset_id: UUID,
        user_id: UUID,
        slots: list,
    ) -> PresetAggregate:
        preset = self.presets.get_by_id(preset_id)
        if not preset or preset.user_id != user_id:
            raise PresetNotFoundError(f"Preset {preset_id} not found")

        validated_slots = _validate_preset_slots(slots, user_id, self.assets)
        preset.replace_slots(validated_slots)
        return self.presets.save(preset)


class DeletePreset:
    """Delete a preset owned by the requester."""

    def __init__(self, preset_repository: PresetRepository):
        self.presets = preset_repository

    def execute(self, preset_id: UUID, user_id: UUID) -> None:
        preset = self.presets.get_by_id(preset_id)
        if not preset or preset.user_id != user_id:
            raise PresetNotFoundError(f"Preset {preset_id} not found")
        self.presets.delete(preset_id)
