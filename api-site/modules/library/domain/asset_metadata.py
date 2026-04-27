# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Asset metadata value objects — read-only summary shapes that
aggregate over the asset library without materialising the underlying
collection. Computed via SQL aggregates in the repository layer (see
`MediaAssetRepository.get_campaign_assets_metadata`) so the count and
size can be returned without loading N rows into Python.

These are domain value objects rather than aggregates: they have no
identity, no behaviour, and no lifecycle — they're pure snapshots
returned by repository queries and consumed by application/API code.
"""

from dataclasses import dataclass


@dataclass(frozen=True)
class CampaignAssetsMetadata:
    """Summary of a campaign's asset library — number of associated
    assets and total bytes across them."""

    asset_count: int
    total_file_size: int
