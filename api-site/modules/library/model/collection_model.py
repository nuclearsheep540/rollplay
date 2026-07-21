# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
AssetCollection ORM Model - user-defined groupings of library assets.

Two kinds share one table:
- manual: an explicit member list (asset_ids array)
- smart:  a stored filter query (filters JSONB) resolved at read time
"""

from sqlalchemy import Column, String, DateTime, ForeignKey, Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID, ARRAY, JSONB
from sqlalchemy.sql import func, text
import uuid

from shared.dependencies.db import Base
from modules.library.domain.collection_kind import CollectionKind


class AssetCollectionModel(Base):
    """
    AssetCollection entity - a named grouping of media assets.

    Manual collections carry members in asset_ids; smart collections
    carry a filter document in filters. The aggregate enforces that a
    row never uses both.
    """
    __tablename__ = 'asset_collections'

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id = Column(UUID(as_uuid=True), ForeignKey('users.id', ondelete='CASCADE'), nullable=False, index=True)

    name = Column(String(120), nullable=False)

    kind = Column(
        SQLEnum(
            CollectionKind,
            name='asset_collection_kind',
            create_type=True,
            values_callable=lambda x: [e.value for e in x]
        ),
        nullable=False,
    )

    # Manual collections: explicit member asset ids
    asset_ids = Column(ARRAY(UUID(as_uuid=True)), default=[], server_default=text("'{}'"), nullable=False)

    # Smart collections: stored filter query
    # { "version": 1, "types": [...], "tags": [...], "campaigns": [...], "text": "" }
    filters = Column(JSONB, nullable=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())

    def __repr__(self):
        return f"<AssetCollection(id={self.id}, name='{self.name}', kind='{self.kind.value}')>"
