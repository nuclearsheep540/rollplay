# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
AssetCollection Aggregate - user-defined groupings of library assets.

Invariants:
- manual collections have members (asset_ids) and no filters
- smart collections have filters and no members
- names are required, trimmed, max 120 chars
- smart filters follow the versioned shape documented below and must
  contain at least one active facet (an all-empty smart collection
  would silently match the whole library)

Filter document shape (version 1), matching the frontend search
contract in rollplay/app/asset_library/utils/assetFilters.js:
    {
      "version": 1,
      "types": ["map", ...],        # OR within facet
      "tags": ["forest", ...],      # AND - narrows
      "campaigns": ["<uuid>", ...], # OR within facet (stringified UUIDs)
      "text": ""                    # name-contains
    }
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID, uuid4

from modules.library.domain.collection_kind import CollectionKind
from modules.library.domain.media_asset_type import MediaAssetType

MAX_COLLECTION_NAME_LENGTH = 120
FILTERS_VERSION = 1


def _validate_name(name: str) -> str:
    cleaned = (name or '').strip()
    if not cleaned:
        raise ValueError("Collection name cannot be empty")
    if len(cleaned) > MAX_COLLECTION_NAME_LENGTH:
        raise ValueError(f"Collection name exceeds {MAX_COLLECTION_NAME_LENGTH} characters")
    return cleaned


def _validate_filters(filters: Dict[str, Any]) -> Dict[str, Any]:
    """Normalize and validate a smart-collection filter document."""
    if not isinstance(filters, dict):
        raise ValueError("Smart collection filters must be an object")

    types = filters.get('types') or []
    tags = filters.get('tags') or []
    campaigns = filters.get('campaigns') or []
    text = (filters.get('text') or '').strip()

    valid_types = {t.value for t in MediaAssetType}
    for asset_type in types:
        if asset_type not in valid_types:
            raise ValueError(f"Unknown asset type in filters: {asset_type}")

    # Campaign ids are stored stringified (JSONB is a serialization
    # boundary); reject anything that isn't a UUID string.
    normalized_campaigns = []
    for campaign_id in campaigns:
        normalized_campaigns.append(str(UUID(str(campaign_id))))

    normalized_tags = []
    for tag in tags:
        cleaned = ' '.join(str(tag).strip().lower().split())
        if cleaned:
            normalized_tags.append(cleaned)

    if not (types or normalized_tags or normalized_campaigns or text):
        raise ValueError("Smart collections need at least one filter")

    return {
        'version': FILTERS_VERSION,
        'types': list(types),
        'tags': normalized_tags,
        'campaigns': normalized_campaigns,
        'text': text,
    }


@dataclass
class AssetCollectionAggregate:
    """A named grouping of media assets - manual members or smart filters."""
    id: Optional[UUID]
    user_id: UUID
    name: str
    kind: CollectionKind
    asset_ids: List[UUID] = field(default_factory=list)
    filters: Optional[Dict[str, Any]] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None

    @classmethod
    def create_manual(cls, user_id: UUID, name: str) -> "AssetCollectionAggregate":
        return cls(
            id=uuid4(),
            user_id=user_id,
            name=_validate_name(name),
            kind=CollectionKind.MANUAL,
            asset_ids=[],
            filters=None,
            created_at=datetime.utcnow(),
        )

    @classmethod
    def create_smart(cls, user_id: UUID, name: str, filters: Dict[str, Any]) -> "AssetCollectionAggregate":
        return cls(
            id=uuid4(),
            user_id=user_id,
            name=_validate_name(name),
            kind=CollectionKind.SMART,
            asset_ids=[],
            filters=_validate_filters(filters),
            created_at=datetime.utcnow(),
        )

    @property
    def is_smart(self) -> bool:
        return self.kind == CollectionKind.SMART

    def rename(self, name: str) -> None:
        self.name = _validate_name(name)
        self.updated_at = datetime.utcnow()

    def update_filters(self, filters: Dict[str, Any]) -> None:
        if not self.is_smart:
            raise ValueError("Only smart collections have filters")
        self.filters = _validate_filters(filters)
        self.updated_at = datetime.utcnow()

    def add_asset(self, asset_id: UUID) -> None:
        if self.is_smart:
            raise ValueError("Smart collections manage membership through filters")
        if asset_id not in self.asset_ids:
            self.asset_ids.append(asset_id)
            self.updated_at = datetime.utcnow()

    def remove_asset(self, asset_id: UUID) -> None:
        if self.is_smart:
            raise ValueError("Smart collections manage membership through filters")
        if asset_id in self.asset_ids:
            self.asset_ids.remove(asset_id)
            self.updated_at = datetime.utcnow()

    def is_owned_by(self, user_id: UUID) -> bool:
        return self.user_id == user_id
