# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Round-trip tests for the four MongoDB-backed services, against a real
MongoDB (decision 9 of .claude/plans/api-game/01-async-mongo-driver.md).

These exist because the async-driver migration rewrote every database call in
api-game and nothing in the suite exercised those paths — the rest of the
tests are pure logic with no store behind them. One write-then-read per
service is the minimum that proves the driver, the awaits, and the cursor
rewrites actually work against MongoDB rather than merely compiling.

Isolation: every test mints its own room id, creates everything it touches,
and deletes it in a finally block. Nothing is shared between tests, nothing
is read that a previous test wrote, and a failure mid-test still cleans up.

They skip (never fail) when MongoDB is unreachable, so the suite still runs
on a machine with no stack up.
"""

import uuid
from datetime import datetime, timezone

import pytest

from adventure_log_service import AdventureLogService
from gameservice import GameService, GameSettings
from imageservice import ImageService, ImageSettings
from mapservice import MapService, MapSettings
from models.log_type import LogType
from mongo_service import mongo_service
from pymongo.errors import ServerSelectionTimeoutError
from shared_contracts.image import ImageConfig
from shared_contracts.map import MapConfig

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend():
    """api-game runs on asyncio; there is no trio in the image."""
    return "asyncio"


@pytest.fixture
async def mongo_up():
    """A MongoDB client bound to THIS test's event loop, or a skip.

    AsyncMongoClient binds to the loop that created it and refuses to be used
    from another ("Cannot use AsyncMongoClient in different event loop"), and
    anyio hands every test a fresh loop — a session-scoped anyio_backend does
    not change that. So the shared singleton is reset here and rebuilt per
    test. Production never does this: one process, one loop, one client for
    its lifetime.

    Skips rather than fails when MongoDB is unreachable, so the suite still
    runs with no stack up.
    """
    await _drop_stale_client()
    try:
        await mongo_service.verify_connection()
    except ServerSelectionTimeoutError as exc:
        pytest.skip(f"MongoDB unreachable, skipping round-trip tests: {exc}")

    yield

    await _drop_stale_client()


async def _drop_stale_client():
    """Close the pooled client, tolerating one left over from another test's
    loop — close() has already dropped the reference by the time it raises."""
    try:
        await mongo_service.close()
    except RuntimeError:
        pass  # bound to a dead loop; the reference is gone either way


def make_room_id() -> str:
    """A fresh id per test — nothing is ever shared between tests."""
    return f"test-roundtrip-{uuid.uuid4()}"


def make_game_settings() -> GameSettings:
    return GameSettings(
        max_players=4,
        seat_layout=["empty", "empty", "empty", "empty"],
        created_at=datetime.now(timezone.utc),
    )


class TestGameServiceRoundTrip:
    async def test_create_read_delete(self, mongo_up):
        room_id = make_room_id()
        try:
            created = await GameService.create_room(make_game_settings(), room_id=room_id)
            assert created == room_id

            room = await GameService.get_room(room_id)
            assert room is not None
            assert room["max_players"] == 4
            assert room["seat_layout"] == ["empty", "empty", "empty", "empty"]
        finally:
            await GameService.delete_room(room_id)

        assert await GameService.get_room(room_id) is None

    async def test_seat_layout_reads_back_as_created(self, mongo_up):
        room_id = make_room_id()
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            assert await GameService.get_seat_layout(room_id) == [
                "empty", "empty", "empty", "empty",
            ]
        finally:
            await GameService.delete_room(room_id)

    async def test_audio_state_write_then_read(self, mongo_up):
        """An ungated write/read pair — seat changes are gated on character
        selection, which is a business rule rather than a driver concern."""
        room_id = make_room_id()
        channel_id = "bgm"
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            await GameService.update_audio_state(
                room_id, channel_id, {"playing": True, "volume": 0.4})

            audio_state = await GameService.get_audio_state(room_id)
            assert audio_state[channel_id]["playing"] is True
            assert audio_state[channel_id]["volume"] == 0.4
        finally:
            await GameService.delete_room(room_id)

    async def test_map_token_op_round_trips(self, mongo_up):
        """The hot path: a committed token move, read back through the same
        call the websocket handler uses."""
        room_id = make_room_id()
        asset_id = str(uuid.uuid4())
        token = {
            "id": str(uuid.uuid4()),
            "kind": "pc",
            "owner_user_id": str(uuid.uuid4()),
            "x": 100.0,
            "y": 200.0,
            "footprint": 1,
        }
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)

            placed = await GameService.apply_map_token_op(
                room_id, asset_id, "place", token=token)
            assert [existing["id"] for existing in placed] == [token["id"]]

            moved = await GameService.apply_map_token_op(
                room_id, asset_id, "move",
                token={**token, "x": 300.0, "y": 400.0}, token_id=token["id"])
            assert moved[0]["x"] == 300.0
            assert moved[0]["y"] == 400.0

            assert await GameService.get_map_tokens(room_id, asset_id) == moved
        finally:
            await GameService.delete_room(room_id)


class TestMapServiceRoundTrip:
    async def test_set_get_clear_active_map(self, mongo_up):
        room_id = make_room_id()
        service = MapService(mongo_service.db)
        settings = MapSettings(
            room_id=room_id,
            uploaded_by=str(uuid.uuid4()),
            map_config=MapConfig(
                asset_id=str(uuid.uuid4()),
                filename="roundtrip.png",
                file_path="maps/roundtrip.png",
            ),
        )
        try:
            assert await service.set_active_map(room_id, settings) is True

            active = await service.get_active_map(room_id)
            assert active is not None
            assert active["map_config"]["filename"] == "roundtrip.png"
        finally:
            # clear_active_map only flips active:false; the row survives. A
            # test must leave nothing behind, so delete it.
            await mongo_service.db.active_maps.delete_many({"room_id": room_id})
            await GameService.delete_room(room_id)

        assert await service.get_active_map(room_id) is None


class TestImageServiceRoundTrip:
    async def test_set_get_clear_active_image(self, mongo_up):
        room_id = make_room_id()
        service = ImageService(mongo_service.db)
        settings = ImageSettings(
            room_id=room_id,
            loaded_by=str(uuid.uuid4()),
            image_config=ImageConfig(
                asset_id=str(uuid.uuid4()),
                filename="roundtrip.jpg",
                file_path="images/roundtrip.jpg",
            ),
        )
        try:
            assert await service.set_active_image(room_id, settings) is True

            active = await service.get_active_image(room_id)
            assert active is not None
            assert active["image_config"]["filename"] == "roundtrip.jpg"
        finally:
            await service.delete_room_images(room_id)
            await GameService.delete_room(room_id)

        assert await service.get_active_image(room_id) is None


class TestAdventureLogServiceRoundTrip:
    async def test_add_and_page_back_logs(self, mongo_up):
        """Covers the paginated find().sort().skip().limit().to_list() rewrite."""
        room_id = make_room_id()
        service = AdventureLogService(mongo_service.db)
        try:
            for index in range(3):
                await service.add_log_entry(
                    room_id=room_id,
                    message=f"roundtrip entry {index}",
                    log_type=LogType.SYSTEM,
                    from_player=None,
                )

            newest_first = await service.get_room_logs(room_id, limit=10)
            assert [entry["message"] for entry in newest_first] == [
                "roundtrip entry 2", "roundtrip entry 1", "roundtrip entry 0",
            ]

            second_page = await service.get_room_logs(room_id, limit=1, skip=1)
            assert [entry["message"] for entry in second_page] == ["roundtrip entry 1"]

            assert await service.get_room_log_count(room_id) == 3
        finally:
            await service.delete_room_logs(room_id)

        assert await service.get_room_log_count(room_id) == 0

    async def test_room_stats_aggregate(self, mongo_up):
        """Covers the awaited aggregate() + to_list() rewrite."""
        room_id = make_room_id()
        service = AdventureLogService(mongo_service.db)
        try:
            await service.add_log_entry(
                room_id=room_id, message="stats entry",
                log_type=LogType.SYSTEM, from_player=None)

            stats = await service.get_room_stats(room_id)
            assert stats["total_logs"] == 1
        finally:
            await service.delete_room_logs(room_id)
