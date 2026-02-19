# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset Repository - Data access layer for MediaAsset aggregate
"""

from typing import List, Optional, Union
from uuid import UUID
from sqlalchemy.orm import Session as DbSession
from sqlalchemy import any_

from modules.library.model.asset_model import MediaAsset as MediaAssetModel
from modules.library.model.map_asset_model import MapAssetModel
from modules.library.model.audio_asset_models import AudioAssetModel, MusicAssetModel, SfxAssetModel
from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.audio_asset_aggregate import AudioAsset
from modules.library.domain.media_asset_type import MediaAssetType


class MediaAssetRepository:
    """Repository handling MediaAsset aggregate persistence with inline ORM conversion"""

    def __init__(self, db_session: DbSession):
        self.db = db_session

    def get_by_id(self, asset_id: UUID) -> Optional[MediaAssetAggregate]:
        """Get media asset by ID"""
        model = (
            self.db.query(MediaAssetModel)
            .filter_by(id=asset_id)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def get_by_user_id(self, user_id: UUID) -> List[MediaAssetAggregate]:
        """Get all media assets owned by a user"""
        models = (
            self.db.query(MediaAssetModel)
            .filter_by(user_id=user_id)
            .order_by(MediaAssetModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_campaign_id(self, campaign_id: UUID) -> List[MediaAssetAggregate]:
        """Get all media assets associated with a campaign"""
        models = (
            self.db.query(MediaAssetModel)
            .filter(MediaAssetModel.campaign_ids.any(campaign_id))
            .order_by(MediaAssetModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_campaign_id_and_type(
        self,
        campaign_id: UUID,
        asset_type: Union[MediaAssetType, str]
    ) -> List[MediaAssetAggregate]:
        """Get media assets by campaign and type"""
        # Convert string to enum if needed
        if isinstance(asset_type, str):
            asset_type = MediaAssetType(asset_type)

        models = (
            self.db.query(MediaAssetModel)
            .filter(
                MediaAssetModel.campaign_ids.any(campaign_id),
                MediaAssetModel.asset_type == asset_type
            )
            .order_by(MediaAssetModel.created_at.desc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def get_by_s3_key(self, s3_key: str) -> Optional[MediaAssetAggregate]:
        """Get media asset by S3 key"""
        model = (
            self.db.query(MediaAssetModel)
            .filter_by(s3_key=s3_key)
            .first()
        )
        if not model:
            return None

        return self._model_to_aggregate(model)

    def save(self, aggregate: Union[MediaAssetAggregate, MapAsset, AudioAsset]) -> UUID:
        """Save media asset aggregate (create or update)"""
        existing = (
            self.db.query(MediaAssetModel)
            .filter_by(id=aggregate.id)
            .first()
        )

        if existing:
            # Update existing base fields
            existing.filename = aggregate.filename
            existing.s3_key = aggregate.s3_key
            existing.content_type = aggregate.content_type
            existing.asset_type = aggregate.asset_type
            existing.file_size = aggregate.file_size
            existing.campaign_ids = aggregate.campaign_ids
            existing.session_ids = aggregate.session_ids

            # Update map-specific fields if MapAsset
            if isinstance(aggregate, MapAsset) and isinstance(existing, MapAssetModel):
                existing.grid_width = aggregate.grid_width
                existing.grid_height = aggregate.grid_height
                existing.grid_opacity = aggregate.grid_opacity

            # Update audio-specific fields if AudioAsset
            if isinstance(aggregate, AudioAsset) and isinstance(existing, AudioAssetModel):
                existing.duration_seconds = aggregate.duration_seconds
                existing.default_volume = aggregate.default_volume
                existing.default_looping = aggregate.default_looping
        else:
            # Create new - determine which model to use
            if isinstance(aggregate, MapAsset):
                model = MapAssetModel(
                    id=aggregate.id,
                    user_id=aggregate.user_id,
                    filename=aggregate.filename,
                    s3_key=aggregate.s3_key,
                    content_type=aggregate.content_type,
                    asset_type=aggregate.asset_type,
                    file_size=aggregate.file_size,
                    campaign_ids=aggregate.campaign_ids,
                    session_ids=aggregate.session_ids,
                    grid_width=aggregate.grid_width,
                    grid_height=aggregate.grid_height,
                    grid_opacity=aggregate.grid_opacity
                )
            elif isinstance(aggregate, AudioAsset):
                # Select correct subclass model based on asset_type
                ModelClass = MusicAssetModel if aggregate.asset_type == MediaAssetType.MUSIC else SfxAssetModel
                model = ModelClass(
                    id=aggregate.id,
                    user_id=aggregate.user_id,
                    filename=aggregate.filename,
                    s3_key=aggregate.s3_key,
                    content_type=aggregate.content_type,
                    asset_type=aggregate.asset_type,
                    file_size=aggregate.file_size,
                    campaign_ids=aggregate.campaign_ids,
                    session_ids=aggregate.session_ids,
                    duration_seconds=aggregate.duration_seconds,
                    default_volume=aggregate.default_volume,
                    default_looping=aggregate.default_looping
                )
            else:
                model = MediaAssetModel(
                    id=aggregate.id,
                    user_id=aggregate.user_id,
                    filename=aggregate.filename,
                    s3_key=aggregate.s3_key,
                    content_type=aggregate.content_type,
                    asset_type=aggregate.asset_type,
                    file_size=aggregate.file_size,
                    campaign_ids=aggregate.campaign_ids,
                    session_ids=aggregate.session_ids
                )
            self.db.add(model)

        self.db.commit()
        return aggregate.id

    def delete(self, asset_id: UUID) -> bool:
        """Delete media asset by ID"""
        model = (
            self.db.query(MediaAssetModel)
            .filter_by(id=asset_id)
            .first()
        )
        if not model:
            return False

        self.db.delete(model)
        self.db.commit()
        return True

    def _model_to_aggregate(self, model: MediaAssetModel) -> Union[MediaAssetAggregate, MapAsset, AudioAsset]:
        """Convert ORM model to domain aggregate (polymorphic)"""
        # Build base aggregate fields
        base = MediaAssetAggregate(
            id=model.id,
            user_id=model.user_id,
            filename=model.filename,
            s3_key=model.s3_key,
            content_type=model.content_type,
            asset_type=model.asset_type,
            file_size=model.file_size,
            campaign_ids=list(model.campaign_ids) if model.campaign_ids else [],
            session_ids=list(model.session_ids) if model.session_ids else [],
            created_at=model.created_at,
            updated_at=model.updated_at
        )

        # If it's a MapAssetModel, promote to MapAsset with grid fields
        if isinstance(model, MapAssetModel):
            return MapAsset.from_base(
                base,
                grid_width=model.grid_width,
                grid_height=model.grid_height,
                grid_opacity=model.grid_opacity
            )

        # If it's an AudioAssetModel, promote to AudioAsset with audio fields
        if isinstance(model, AudioAssetModel):
            return AudioAsset.from_base(
                base,
                duration_seconds=model.duration_seconds,
                default_volume=model.default_volume,
                default_looping=model.default_looping
            )

        return base
