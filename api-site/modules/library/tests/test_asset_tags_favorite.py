# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Tests for asset tags + favorite (Library v2, PR 1).

Covers:
- Aggregate tag normalization rules and limits
- from_base() carrying base fields into subtype aggregates
  (the drift path that would silently wipe tags on save)
- Repository round-trips for tags/favorite through polymorphic load
- Command ownership guards
"""

import pytest
from uuid import uuid4

from modules.library.domain.asset_aggregate import (
    MediaAssetAggregate,
    MAX_TAG_LENGTH,
    MAX_TAGS_PER_ASSET,
)
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.domain.music_asset_aggregate import MusicAsset
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.application.commands import UpdateAssetTags, SetAssetFavorite


@pytest.fixture
def asset_repo(db_session):
    return MediaAssetRepository(db_session)


@pytest.fixture
def create_map_asset(asset_repo):
    """Factory: persisted MapAsset owned by the given user."""
    def _create(user, filename="forest.png", tags=None, favorite=False):
        asset = MapAsset.create(
            user_id=user.id,
            filename=filename,
            s3_key=f"map/{user.id}/{filename}",
            content_type="image/png",
            file_size=1024,
        )
        if tags:
            asset.set_tags(tags)
        if favorite:
            asset.set_favorite(True)
        asset_repo.save(asset)
        return asset
    return _create


# ── Aggregate rules ──────────────────────────────────────────────────────────

class TestSetTags:
    def _asset(self):
        return MediaAssetAggregate.create(
            user_id=uuid4(),
            filename="a.png",
            s3_key="k",
            content_type="image/png",
            asset_type="image",
        )

    def test_normalizes_case_whitespace_and_duplicates(self):
        asset = self._asset()
        asset.set_tags(["  Forest ", "forest", "Dark   Woods", "", "SEA"])
        assert asset.tags == ["forest", "dark woods", "sea"]

    def test_rejects_overlong_tag(self):
        asset = self._asset()
        with pytest.raises(ValueError, match="exceeds"):
            asset.set_tags(["x" * (MAX_TAG_LENGTH + 1)])

    def test_rejects_too_many_tags(self):
        asset = self._asset()
        with pytest.raises(ValueError, match="at most"):
            asset.set_tags([f"tag{n}" for n in range(MAX_TAGS_PER_ASSET + 1)])

    def test_replace_is_atomic(self):
        asset = self._asset()
        asset.set_tags(["forest"])
        asset.set_tags(["sea", "harbor"])
        assert asset.tags == ["sea", "harbor"]

    def test_set_favorite_toggles(self):
        asset = self._asset()
        assert asset.favorite is False
        asset.set_favorite(True)
        assert asset.favorite is True


class TestFromBaseCarriesNewFields:
    """A base field missing from from_base() would be wiped on the next
    save of a subtype aggregate - base_kwargs() exists to prevent that."""

    def test_map_from_base_keeps_tags_and_favorite(self):
        base = MediaAssetAggregate.create(
            user_id=uuid4(),
            filename="a.png",
            s3_key="k",
            content_type="image/png",
            asset_type="map",
        )
        base.set_tags(["forest"])
        base.set_favorite(True)
        promoted = MapAsset.from_base(base, grid_width=10)
        assert promoted.tags == ["forest"]
        assert promoted.favorite is True
        assert promoted.grid_width == 10

    def test_music_from_base_keeps_tags_and_favorite(self):
        base = MediaAssetAggregate.create(
            user_id=uuid4(),
            filename="a.mp3",
            s3_key="k2",
            content_type="audio/mpeg",
            asset_type="music",
        )
        base.set_tags(["tavern"])
        base.set_favorite(True)
        promoted = MusicAsset.from_base(base, duration_seconds=120.0)
        assert promoted.tags == ["tavern"]
        assert promoted.favorite is True


# ── Repository round-trips ───────────────────────────────────────────────────

class TestRepositoryPersistence:
    def test_tags_and_favorite_survive_save_and_polymorphic_load(
        self, asset_repo, create_user, create_map_asset
    ):
        user = create_user()
        asset = create_map_asset(user, tags=["forest", "night"], favorite=True)

        loaded = asset_repo.get_by_id(asset.id)
        assert isinstance(loaded, MapAsset)
        assert loaded.tags == ["forest", "night"]
        assert loaded.favorite is True

    def test_update_tags_on_loaded_subtype_does_not_wipe(
        self, asset_repo, create_user, create_map_asset
    ):
        user = create_user()
        asset = create_map_asset(user, tags=["forest"])

        loaded = asset_repo.get_by_id(asset.id)
        loaded.set_tags(["forest", "dungeon"])
        asset_repo.save(loaded)

        reloaded = asset_repo.get_by_id(asset.id)
        assert reloaded.tags == ["forest", "dungeon"]

    def test_new_assets_default_to_no_tags_not_favorite(
        self, asset_repo, create_user, create_map_asset
    ):
        user = create_user()
        asset = create_map_asset(user)
        loaded = asset_repo.get_by_id(asset.id)
        assert loaded.tags == []
        assert loaded.favorite is False


# ── Commands ─────────────────────────────────────────────────────────────────

class TestCommands:
    def test_update_tags_happy_path(self, asset_repo, create_user, create_map_asset):
        user = create_user()
        asset = create_map_asset(user)

        result = UpdateAssetTags(asset_repo).execute(asset.id, user.id, ["  Sea ", "Harbor"])
        assert result.tags == ["sea", "harbor"]

        assert asset_repo.get_by_id(asset.id).tags == ["sea", "harbor"]

    def test_update_tags_rejects_other_users_asset(
        self, asset_repo, create_user, create_map_asset
    ):
        owner = create_user()
        stranger = create_user()
        asset = create_map_asset(owner)

        with pytest.raises(ValueError, match="another user"):
            UpdateAssetTags(asset_repo).execute(asset.id, stranger.id, ["sea"])

    def test_update_tags_missing_asset_raises(self, asset_repo, create_user):
        user = create_user()
        with pytest.raises(ValueError, match="not found"):
            UpdateAssetTags(asset_repo).execute(uuid4(), user.id, ["sea"])

    def test_set_favorite_happy_path_and_ownership(
        self, asset_repo, create_user, create_map_asset
    ):
        owner = create_user()
        stranger = create_user()
        asset = create_map_asset(owner)

        result = SetAssetFavorite(asset_repo).execute(asset.id, owner.id, True)
        assert result.favorite is True
        assert asset_repo.get_by_id(asset.id).favorite is True

        with pytest.raises(ValueError, match="another user"):
            SetAssetFavorite(asset_repo).execute(asset.id, stranger.id, False)
