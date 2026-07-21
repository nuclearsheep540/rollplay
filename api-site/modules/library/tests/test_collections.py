# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""
Tests for asset collections (Library v2, PR 3).

Covers:
- Aggregate invariants (manual vs smart, name + filter validation)
- Repository round-trips
- Command ownership guards and member management
- Dangling-member pruning on asset delete
"""

import pytest
from uuid import uuid4

from modules.library.domain.collection_aggregate import AssetCollectionAggregate
from modules.library.domain.collection_kind import CollectionKind
from modules.library.domain.map_asset_aggregate import MapAsset
from modules.library.repositories.asset_repository import MediaAssetRepository
from modules.library.repositories.collection_repository import AssetCollectionRepository
from modules.library.application.commands import (
    CreateCollection,
    UpdateCollection,
    AddAssetToCollection,
    RemoveAssetFromCollection,
    DeleteCollection,
    CollectionNotFoundError,
)


@pytest.fixture
def asset_repo(db_session):
    return MediaAssetRepository(db_session)


@pytest.fixture
def collection_repo(db_session):
    return AssetCollectionRepository(db_session)


@pytest.fixture
def create_map_asset(asset_repo):
    def _create(user, filename="forest.png"):
        asset = MapAsset.create(
            user_id=user.id,
            filename=filename,
            s3_key=f"map/{user.id}/{filename}",
            content_type="image/png",
        )
        asset_repo.save(asset)
        return asset
    return _create


# ── Aggregate invariants ─────────────────────────────────────────────────────

class TestCollectionAggregate:
    def test_manual_collection_has_no_filters(self):
        collection = AssetCollectionAggregate.create_manual(user_id=uuid4(), name="  NPC Portraits ")
        assert collection.kind == CollectionKind.MANUAL
        assert collection.name == "NPC Portraits"
        assert collection.filters is None
        assert collection.asset_ids == []

    def test_smart_collection_normalizes_filters(self):
        campaign_id = uuid4()
        collection = AssetCollectionAggregate.create_smart(
            user_id=uuid4(),
            name="Sea Session",
            filters={'types': ['map', 'music'], 'tags': ['  Sea '], 'campaigns': [str(campaign_id)]},
        )
        assert collection.kind == CollectionKind.SMART
        assert collection.filters == {
            'version': 1,
            'types': ['map', 'music'],
            'tags': ['sea'],
            'campaigns': [str(campaign_id)],
            'text': '',
        }

    def test_smart_collection_requires_a_filter(self):
        with pytest.raises(ValueError, match="at least one filter"):
            AssetCollectionAggregate.create_smart(user_id=uuid4(), name="Empty", filters={})

    def test_smart_collection_rejects_unknown_type(self):
        with pytest.raises(ValueError, match="Unknown asset type"):
            AssetCollectionAggregate.create_smart(user_id=uuid4(), name="Bad", filters={'types': ['npc']})

    def test_empty_name_rejected(self):
        with pytest.raises(ValueError, match="cannot be empty"):
            AssetCollectionAggregate.create_manual(user_id=uuid4(), name="   ")

    def test_manual_membership_add_remove(self):
        collection = AssetCollectionAggregate.create_manual(user_id=uuid4(), name="Kit")
        asset_id = uuid4()
        collection.add_asset(asset_id)
        collection.add_asset(asset_id)  # idempotent
        assert collection.asset_ids == [asset_id]
        collection.remove_asset(asset_id)
        assert collection.asset_ids == []

    def test_smart_collection_rejects_membership(self):
        collection = AssetCollectionAggregate.create_smart(
            user_id=uuid4(), name="Sea", filters={'tags': ['sea']}
        )
        with pytest.raises(ValueError, match="through filters"):
            collection.add_asset(uuid4())

    def test_manual_collection_rejects_filters(self):
        collection = AssetCollectionAggregate.create_manual(user_id=uuid4(), name="Kit")
        with pytest.raises(ValueError, match="Only smart collections"):
            collection.update_filters({'tags': ['sea']})


# ── Repository + commands ────────────────────────────────────────────────────

class TestCollectionCommands:
    def test_create_and_list_round_trip(self, collection_repo, create_user):
        user = create_user()
        CreateCollection(collection_repo).execute(user_id=user.id, name="Kit", kind="manual")
        CreateCollection(collection_repo).execute(
            user_id=user.id, name="Sea", kind="smart", filters={'tags': ['sea']}
        )

        collections = collection_repo.get_by_user_id(user.id)
        assert [c.name for c in collections] == ["Kit", "Sea"]
        assert collections[0].kind == CollectionKind.MANUAL
        assert collections[1].kind == CollectionKind.SMART
        assert collections[1].filters['tags'] == ['sea']

    def test_update_rename_and_filters(self, collection_repo, create_user):
        user = create_user()
        smart = CreateCollection(collection_repo).execute(
            user_id=user.id, name="Sea", kind="smart", filters={'tags': ['sea']}
        )

        updated = UpdateCollection(collection_repo).execute(
            collection_id=smart.id, user_id=user.id, name="Sea Session", filters={'tags': ['sea', 'harbor']}
        )
        assert updated.name == "Sea Session"
        assert updated.filters['tags'] == ['sea', 'harbor']

        reloaded = collection_repo.get_by_id(smart.id)
        assert reloaded.name == "Sea Session"
        assert reloaded.filters['tags'] == ['sea', 'harbor']

    def test_ownership_guard(self, collection_repo, create_user):
        owner = create_user()
        stranger = create_user()
        collection = CreateCollection(collection_repo).execute(user_id=owner.id, name="Kit", kind="manual")

        with pytest.raises(CollectionNotFoundError):
            UpdateCollection(collection_repo).execute(
                collection_id=collection.id, user_id=stranger.id, name="Stolen"
            )
        with pytest.raises(CollectionNotFoundError):
            DeleteCollection(collection_repo).execute(collection_id=collection.id, user_id=stranger.id)

    def test_add_and_remove_member(self, collection_repo, asset_repo, create_user, create_map_asset):
        user = create_user()
        asset = create_map_asset(user)
        collection = CreateCollection(collection_repo).execute(user_id=user.id, name="Kit", kind="manual")

        AddAssetToCollection(collection_repo, asset_repo).execute(
            collection_id=collection.id, asset_id=asset.id, user_id=user.id
        )
        assert collection_repo.get_by_id(collection.id).asset_ids == [asset.id]

        RemoveAssetFromCollection(collection_repo).execute(
            collection_id=collection.id, asset_id=asset.id, user_id=user.id
        )
        assert collection_repo.get_by_id(collection.id).asset_ids == []

    def test_add_rejects_unowned_asset(self, collection_repo, asset_repo, create_user, create_map_asset):
        owner = create_user()
        stranger = create_user()
        strangers_asset = create_map_asset(stranger)
        collection = CreateCollection(collection_repo).execute(user_id=owner.id, name="Kit", kind="manual")

        with pytest.raises(ValueError, match="not found"):
            AddAssetToCollection(collection_repo, asset_repo).execute(
                collection_id=collection.id, asset_id=strangers_asset.id, user_id=owner.id
            )

    def test_delete_collection_leaves_assets(self, collection_repo, asset_repo, create_user, create_map_asset):
        user = create_user()
        asset = create_map_asset(user)
        collection = CreateCollection(collection_repo).execute(user_id=user.id, name="Kit", kind="manual")
        AddAssetToCollection(collection_repo, asset_repo).execute(
            collection_id=collection.id, asset_id=asset.id, user_id=user.id
        )

        DeleteCollection(collection_repo).execute(collection_id=collection.id, user_id=user.id)
        assert collection_repo.get_by_id(collection.id) is None
        assert asset_repo.get_by_id(asset.id) is not None


class TestDanglingMemberPruning:
    def test_remove_asset_from_all_prunes_members(
        self, collection_repo, asset_repo, create_user, create_map_asset
    ):
        user = create_user()
        asset = create_map_asset(user)
        keeper = create_map_asset(user, filename="keeper.png")

        first = CreateCollection(collection_repo).execute(user_id=user.id, name="A", kind="manual")
        second = CreateCollection(collection_repo).execute(user_id=user.id, name="B", kind="manual")
        adder = AddAssetToCollection(collection_repo, asset_repo)
        adder.execute(collection_id=first.id, asset_id=asset.id, user_id=user.id)
        adder.execute(collection_id=first.id, asset_id=keeper.id, user_id=user.id)
        adder.execute(collection_id=second.id, asset_id=asset.id, user_id=user.id)

        collection_repo.remove_asset_from_all(asset.id, user.id)

        assert collection_repo.get_by_id(first.id).asset_ids == [keeper.id]
        assert collection_repo.get_by_id(second.id).asset_ids == []
