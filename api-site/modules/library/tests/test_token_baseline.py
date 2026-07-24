# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for the npc token baseline (tokens v2, decision 22):
MapAsset.update_token_config validation, the board-in-play guard
(decision 26), and UpdateTokenConfig's attribution stamping.

DB-free: the aggregate and guard are pure; the command runs against
fakes for the repository pair.
"""

from datetime import datetime
from types import SimpleNamespace
from uuid import uuid4

import pytest

from modules.library.application.commands import (
    BoardInPlayError,
    UpdateTokenConfig,
    check_map_boards_in_play,
)
from modules.library.domain.map_asset_aggregate import MapAsset, TOKEN_BASELINE_MAX
from modules.library.domain.media_asset_type import MediaAssetType
from modules.session.domain.session_aggregate import SessionStatus


def make_map_asset(owner_id=None, campaign_ids=None):
    return MapAsset(
        id=uuid4(),
        user_id=owner_id or uuid4(),
        filename="dungeon.png",
        s3_key="maps/dungeon.png",
        content_type="image/png",
        asset_type=MediaAssetType.MAP,
        file_size=1234,
        campaign_ids=campaign_ids or [],
        created_at=datetime.utcnow(),
        updated_at=None,
    )


def make_baseline_token(**overrides):
    token = {
        "id": str(uuid4()),
        "kind": "npc",
        "owner_user_id": None,
        "character_id": None,
        "label": "Pit Trap",
        "x": 350.0,
        "y": 650.0,
        "footprint": 1,
        "created_by": "dm-user",
        "updated_at": None,
        "hidden": True,
        "locked": False,
    }
    token.update(overrides)
    return token


class TestUpdateTokenConfigAggregate:
    def test_valid_baseline_stores_versioned(self):
        asset = make_map_asset()
        asset.update_token_config([make_baseline_token(), make_baseline_token(label="Goblin")])
        assert asset.token_config["version"] == 1
        assert len(asset.token_config["tokens"]) == 2

    def test_none_or_empty_clears(self):
        asset = make_map_asset()
        asset.update_token_config([make_baseline_token()])
        asset.update_token_config(None)
        assert asset.token_config is None
        asset.update_token_config([make_baseline_token()])
        asset.update_token_config([])
        assert asset.token_config is None

    def test_pc_tokens_rejected(self):
        asset = make_map_asset()
        pc_token = make_baseline_token(kind="pc", owner_user_id="player-1", hidden=False, locked=False)
        with pytest.raises(ValueError, match="npc-only"):
            asset.update_token_config([pc_token])

    def test_baseline_cannot_reference_users(self):
        # Assignment is a session act — a companion baseline token with an
        # owner would leak people-state onto the shared asset.
        asset = make_map_asset()
        assigned = make_baseline_token(owner_user_id="player-1")
        with pytest.raises(ValueError, match="session act"):
            asset.update_token_config([assigned])

    def test_duplicate_ids_rejected(self):
        asset = make_map_asset()
        duplicated = make_baseline_token()
        with pytest.raises(ValueError, match="Duplicate"):
            asset.update_token_config([duplicated, dict(duplicated)])

    def test_cap_enforced(self):
        asset = make_map_asset()
        oversized = []
        for _index in range(TOKEN_BASELINE_MAX + 1):
            oversized.append(make_baseline_token())
        with pytest.raises(ValueError, match=str(TOKEN_BASELINE_MAX)):
            asset.update_token_config(oversized)

    def test_build_token_baseline_salvages(self):
        asset = make_map_asset()
        asset.update_token_config([make_baseline_token(label="Goblin")])
        # Corrupt one stored token in place (simulating cold data across a
        # contract change) — build must drop it, not raise.
        asset.token_config["tokens"].append({"id": "broken"})
        baseline = asset.build_token_baseline()
        assert len(baseline) == 1
        assert baseline[0]["label"] == "Goblin"


def make_session(status, boards=None, seeds=None):
    return SimpleNamespace(status=status, map_token_state=boards or {}, map_token_seed=seeds or {})


class FakeSessionRepository:
    def __init__(self, sessions):
        self.sessions = sessions

    def get_by_campaign_id(self, campaign_id):
        return self.sessions


class TestBoardInPlayGuard:
    """In-play = board differs from seed (decision 25, derived not stored)."""

    def test_preseed_board_blocks(self):
        # Pre-migration paused row: board with no seed — preserve, never destroy.
        asset_id = uuid4()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE, {str(asset_id): [make_baseline_token()]}),
        ])
        with pytest.raises(BoardInPlayError):
            check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_board_matching_seed_does_not_block(self):
        # Seeded, never touched (updated_at drift ignored): workshop stays open.
        asset_id = uuid4()
        seeded_token = make_baseline_token()
        board_copy = dict(seeded_token, updated_at="2026-07-23T10:00:00+00:00")
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE,
                         boards={str(asset_id): [board_copy]},
                         seeds={str(asset_id): [seeded_token]}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_play_moved_token_blocks(self):
        asset_id = uuid4()
        seeded_token = make_baseline_token()
        moved_copy = dict(seeded_token, x=999.0)
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE,
                         boards={str(asset_id): [moved_copy]},
                         seeds={str(asset_id): [seeded_token]}),
        ])
        with pytest.raises(BoardInPlayError):
            check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_reverted_board_does_not_block(self):
        # A pc token placed then removed leaves board == seed — not in play.
        asset_id = uuid4()
        seeded_token = make_baseline_token()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE,
                         boards={str(asset_id): [dict(seeded_token)]},
                         seeds={str(asset_id): [seeded_token]}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_force_proceeds(self):
        asset_id = uuid4()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE, {str(asset_id): [make_baseline_token()]}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo, force=True)

    def test_finished_sessions_never_block(self):
        asset_id = uuid4()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.FINISHED, {str(asset_id): [make_baseline_token()]}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_empty_or_absent_board_never_blocks(self):
        asset_id = uuid4()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE, {str(asset_id): []}),
            make_session(SessionStatus.INACTIVE, {}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo)

    def test_other_maps_boards_never_block(self):
        asset_id = uuid4()
        session_repo = FakeSessionRepository([
            make_session(SessionStatus.INACTIVE, {str(uuid4()): [make_baseline_token()]}),
        ])
        check_map_boards_in_play(asset_id, [uuid4()], session_repo)


class FakeAssetRepository:
    def __init__(self, asset):
        self.asset = asset
        self.saved = None

    def get_by_id(self, asset_id):
        return self.asset

    def save(self, aggregate):
        self.saved = aggregate


class TestUpdateTokenConfigCommand:
    def test_created_by_is_server_stamped(self):
        owner_id = uuid4()
        asset = make_map_asset(owner_id=owner_id)
        repository = FakeAssetRepository(asset)

        command = UpdateTokenConfig(repository, session_repository=None)
        wire_token = make_baseline_token(created_by="spoofed-user")
        updated = command.execute(asset_id=asset.id, user_id=owner_id, tokens=[wire_token])

        stored_token = updated.token_config["tokens"][0]
        assert stored_token["created_by"] == str(owner_id)
        assert repository.saved is asset

    def test_non_map_asset_rejected(self):
        owner_id = uuid4()
        wrong_asset = SimpleNamespace(
            id=uuid4(),
            is_owned_by=lambda user_id: True,
        )
        repository = FakeAssetRepository(wrong_asset)
        command = UpdateTokenConfig(repository, session_repository=None)
        with pytest.raises(ValueError, match="map assets"):
            command.execute(asset_id=wrong_asset.id, user_id=owner_id, tokens=[make_baseline_token()])
