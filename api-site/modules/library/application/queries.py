# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
MediaAsset Queries - Read operations for media asset management
"""

from typing import List, Optional, Union
from uuid import UUID

from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.media_asset_type import MediaAssetType
from modules.library.repositories.asset_repository import MediaAssetRepository


class GetMediaAssetsByUser:
    """
    Get all media assets owned by a user.
    """

    def __init__(self, repository: MediaAssetRepository):
        self.repository = repository

    def execute(
        self,
        user_id: UUID,
        asset_type: Optional[Union[MediaAssetType, str]] = None
    ) -> List[MediaAssetAggregate]:
        """
        Get user's media assets, optionally filtered by type.

        Args:
            user_id: The user's ID
            asset_type: Optional filter by asset type

        Returns:
            List of MediaAssetAggregate
        """
        assets = self.repository.get_by_user_id(user_id)

        if asset_type:
            # Convert string to enum if needed for comparison
            if isinstance(asset_type, str):
                asset_type = MediaAssetType(asset_type)
            assets = [a for a in assets if a.asset_type == asset_type]

        return assets


class GetMediaAssetsByCampaign:
    """
    Get all media assets associated with a campaign.
    """

    def __init__(self, repository: MediaAssetRepository):
        self.repository = repository

    def execute(
        self,
        campaign_id: UUID,
        asset_type: Optional[Union[MediaAssetType, str]] = None
    ) -> List[MediaAssetAggregate]:
        """
        Get campaign's media assets, optionally filtered by type.

        Args:
            campaign_id: The campaign's ID
            asset_type: Optional filter by asset type

        Returns:
            List of MediaAssetAggregate
        """
        if asset_type:
            return self.repository.get_by_campaign_id_and_type(campaign_id, asset_type)
        else:
            return self.repository.get_by_campaign_id(campaign_id)
