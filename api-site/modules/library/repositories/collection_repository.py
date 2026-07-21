# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
AssetCollection Repository - Data access layer for AssetCollection aggregate
"""

from typing import List, Optional
from uuid import UUID
from sqlalchemy.orm import Session as DbSession
import logging

from modules.library.model.collection_model import AssetCollectionModel
from modules.library.domain.collection_aggregate import AssetCollectionAggregate

logger = logging.getLogger(__name__)


class AssetCollectionRepository:
    """Repository handling AssetCollection persistence with inline ORM conversion"""

    def __init__(self, db_session: DbSession):
        self.db = db_session

    def get_by_id(self, collection_id: UUID) -> Optional[AssetCollectionAggregate]:
        model = self.db.get(AssetCollectionModel, collection_id)
        if not model:
            return None
        return self._model_to_aggregate(model)

    def get_by_user_id(self, user_id: UUID) -> List[AssetCollectionAggregate]:
        models = (
            self.db.query(AssetCollectionModel)
            .filter(AssetCollectionModel.user_id == user_id)
            .order_by(AssetCollectionModel.created_at.asc())
            .all()
        )
        return [self._model_to_aggregate(model) for model in models]

    def save(self, aggregate: AssetCollectionAggregate) -> UUID:
        existing = self.db.get(AssetCollectionModel, aggregate.id)

        if existing:
            existing.name = aggregate.name
            existing.kind = aggregate.kind
            existing.asset_ids = aggregate.asset_ids
            existing.filters = aggregate.filters
        else:
            model = AssetCollectionModel(
                id=aggregate.id,
                user_id=aggregate.user_id,
                name=aggregate.name,
                kind=aggregate.kind,
                asset_ids=aggregate.asset_ids,
                filters=aggregate.filters,
            )
            self.db.add(model)

        self.db.commit()
        return aggregate.id

    def delete(self, collection_id: UUID) -> bool:
        model = self.db.get(AssetCollectionModel, collection_id)
        if not model:
            return False
        self.db.delete(model)
        self.db.commit()
        return True

    def remove_asset_from_all(self, asset_id: UUID, user_id: UUID) -> None:
        """Prune a deleted asset from the owner's manual collections -
        called by DeleteMediaAsset so member lists never hold dangling
        ids. Assets and collections share an owner, so scoping by
        user_id covers every collection that could reference the asset."""
        models = (
            self.db.query(AssetCollectionModel)
            .filter(AssetCollectionModel.user_id == user_id)
            .all()
        )
        changed = False
        for model in models:
            member_ids = list(model.asset_ids) if model.asset_ids else []
            if asset_id in member_ids:
                member_ids.remove(asset_id)
                model.asset_ids = member_ids
                changed = True
        if changed:
            self.db.commit()

    def _model_to_aggregate(self, model: AssetCollectionModel) -> AssetCollectionAggregate:
        return AssetCollectionAggregate(
            id=model.id,
            user_id=model.user_id,
            name=model.name,
            kind=model.kind,
            asset_ids=list(model.asset_ids) if model.asset_ids else [],
            filters=dict(model.filters) if model.filters else None,
            created_at=model.created_at,
            updated_at=model.updated_at,
        )
