# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for image focal areas (tokens v2 decision 27, v3 decision 34):
ImageAsset.set_focal_area validation and the SetImageFocalArea command.

DB-free: the aggregate is pure; the command runs against a fake repository.

Deliberately absent (v3, decision 34): there are no active-session guard
tests because the command has no session guard. Crops snapshot into
token_images at session start, so a mid-session edit cannot desync live
play — it lands next session, like changing the character avatar itself.
"""

from uuid import uuid4

import pytest

from modules.library.application.commands import SetImageFocalArea
from modules.library.domain.asset_aggregate import MediaAssetAggregate
from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.library.domain.media_asset_type import MediaAssetType


def make_image_asset(owner_id=None):
    return ImageAsset.create(
        user_id=owner_id or uuid4(),
        filename="portrait.png",
        s3_key="images/portrait.png",
        content_type="image/png",
        file_size=1234,
    )


class FakeAssetRepository:
    def __init__(self, asset):
        self.asset = asset
        self.saved = None

    def get_by_id(self, asset_id):
        return self.asset

    def save(self, asset):
        self.saved = asset
        return asset


class TestSetFocalAreaAggregate:
    def test_set_stores_validated_area(self):
        asset = make_image_asset()
        asset.set_focal_area("token", {"x": 340, "y": 120, "size": 512})
        assert asset.get_focal_area("token") == {"x": 340.0, "y": 120.0, "size": 512.0}

    def test_card_purpose_stores_a_region(self):
        """A campaign card is 16:4, so its purpose stores a rectangle — the FocalRegion
        sibling — while token keeps its square. The purpose's convention picks the shape."""
        asset = make_image_asset()
        asset.set_focal_area("card", {"x": 10, "y": 20, "width": 1600, "height": 400})
        assert asset.get_focal_area("card") == {"x": 10.0, "y": 20.0, "width": 1600.0, "height": 400.0}

    def test_a_square_and_a_region_may_coexist_on_one_image(self):
        asset = make_image_asset()
        asset.set_focal_area("token", {"x": 0, "y": 0, "size": 100})
        asset.set_focal_area("card", {"x": 0, "y": 0, "width": 400, "height": 100})
        assert "size" in asset.get_focal_area("token")
        assert "width" in asset.get_focal_area("card")

    def test_a_shape_that_is_both_is_rejected(self):
        """size alongside width/height would leave a consumer unable to tell which it holds."""
        asset = make_image_asset()
        with pytest.raises(ValueError):
            asset.set_focal_area("card", {"x": 0, "y": 0, "size": 100, "width": 400, "height": 100})

    def test_a_shape_that_is_neither_is_rejected(self):
        asset = make_image_asset()
        with pytest.raises(ValueError):
            asset.set_focal_area("card", {"x": 0, "y": 0, "width": 400})

    def test_purposes_are_independent(self):
        asset = make_image_asset()
        asset.set_focal_area("token", {"x": 0, "y": 0, "size": 100})
        asset.set_focal_area("character", {"x": 50, "y": 50, "size": 200})
        assert asset.get_focal_area("token")["size"] == 100.0
        assert asset.get_focal_area("character")["size"] == 200.0

    def test_none_clears_one_purpose(self):
        asset = make_image_asset()
        asset.set_focal_area("token", {"x": 0, "y": 0, "size": 100})
        asset.set_focal_area("token", None)
        assert asset.get_focal_area("token") is None
        assert asset.focal_areas is None

    def test_blank_purpose_rejected(self):
        asset = make_image_asset()
        with pytest.raises(ValueError, match="purpose"):
            asset.set_focal_area("  ", {"x": 0, "y": 0, "size": 100})

    def test_invalid_area_shape_rejected(self):
        asset = make_image_asset()
        with pytest.raises(Exception):
            asset.set_focal_area("token", {"x": -5, "y": 0, "size": 100})
        with pytest.raises(Exception):
            asset.set_focal_area("token", {"x": 0, "y": 0, "size": 0})


class TestSetImageFocalAreaCommand:
    def test_sets_and_saves(self):
        owner_id = uuid4()
        repository = FakeAssetRepository(make_image_asset(owner_id))
        command = SetImageFocalArea(repository)
        asset = command.execute(
            asset_id=repository.asset.id,
            user_id=owner_id,
            purpose="token",
            area={"x": 10, "y": 20, "size": 64},
        )
        assert asset.get_focal_area("token") == {"x": 10.0, "y": 20.0, "size": 64.0}
        assert repository.saved is asset

    def test_non_owner_rejected(self):
        repository = FakeAssetRepository(make_image_asset())
        command = SetImageFocalArea(repository)
        with pytest.raises(ValueError, match="another user"):
            command.execute(
                asset_id=repository.asset.id,
                user_id=uuid4(),
                purpose="token",
                area={"x": 0, "y": 0, "size": 64},
            )

    def test_non_image_asset_rejected(self):
        owner_id = uuid4()
        music_asset = MediaAssetAggregate.create(
            user_id=owner_id,
            filename="theme.mp3",
            s3_key="music/theme.mp3",
            content_type="audio/mpeg",
            asset_type=MediaAssetType.MUSIC,
        )
        repository = FakeAssetRepository(music_asset)
        command = SetImageFocalArea(repository)
        with pytest.raises(ValueError, match="image assets"):
            command.execute(
                asset_id=music_asset.id,
                user_id=owner_id,
                purpose="token",
                area={"x": 0, "y": 0, "size": 64},
            )
