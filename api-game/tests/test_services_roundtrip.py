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

import asyncio
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


class TestConcurrentWrites:
    """Two writers, one document, at the same time.

    Under the old blocking driver these could not interleave: a handler ran
    start to finish and the read-modify-write was an accidental critical
    section. Awaiting every database call removed that, so a writer that reads
    a container, changes one member and writes the whole container back now
    erases whatever landed in between (plan api-game/03).

    asyncio.gather is used where the bug needs two writers in flight at once.
    It does NOT guarantee they interleave — each coroutine runs to its first
    await, but which read resolves first is up to the driver's connection
    pool — so a test that passes on the unfixed code is not evidence of the
    bug. The seat test below avoids the question by reproducing its bug with
    no concurrency at all.
    """

    async def test_two_players_selecting_characters_keep_both_entries(self, mongo_up):
        """The session-start case: two players choose a character at once."""
        room_id = make_room_id()
        alice, bob = str(uuid.uuid4()), str(uuid.uuid4())
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)

            await asyncio.gather(
                GameService.update_player_character(
                    room_id, {"user_id": alice, "player_name": "Alice",
                              "character_name": "Lyra", "hp_current": 10}),
                GameService.update_player_character(
                    room_id, {"user_id": bob, "player_name": "Bob",
                              "character_name": "Kade", "hp_current": 12}),
            )

            room = await GameService.get_room(room_id)
            metadata = room.get("player_metadata", {})
            assert metadata.get(alice, {}).get("character_name") == "Lyra"
            assert metadata.get(bob, {}).get("character_name") == "Kade"
        finally:
            await GameService.delete_room(room_id)

    async def test_concurrent_edits_to_one_player_keep_both_fields(self, mongo_up):
        """The DM reduces a player's health while that player renames.

        Same entry, disjoint fields, two actors. Both must survive.

        NOT evidence that the bug existed: this test also PASSED against the
        unfixed whole-map write, because gather happened not to interleave
        these two reads. It is kept as a guarantee of the fixed shape — the
        two writes now touch disjoint paths, so they cannot lose each other
        regardless of ordering — and must not be cited as a reproduction.
        """
        room_id = make_room_id()
        player = str(uuid.uuid4())
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            await GameService.update_player_character(
                room_id, {"user_id": player, "player_name": "Old", "hp_current": 20})

            await asyncio.gather(
                GameService.update_player_character(
                    room_id, {"user_id": player, "player_name": "New"}),
                GameService.update_player_character(
                    room_id, {"user_id": player, "hp_current": 5}),
            )

            entry = (await GameService.get_room(room_id))["player_metadata"][player]
            assert entry["player_name"] == "New"
            assert entry["hp_current"] == 5
        finally:
            await GameService.delete_room(room_id)

    @pytest.mark.xfail(
        strict=True,
        reason="Known gap (plan api-game/03): seat_change sends the whole array, "
               "so a stale 'empty' is indistinguishable from a vacated seat and "
               "no server-side write strategy can narrow it. Needs a wire change "
               "to send the seat index + occupant. Remove this marker when fixed.",
    )
    async def test_stale_seat_layout_copy_erases_another_players_seat(self, mongo_up):
        """Seat layout is an array every player writes whole.

        Unlike the player_metadata cases above, this one is NOT fixed: it is
        here to hold the gap open and will fail loudly (strict xfail) the day
        someone makes it pass, so the marker cannot rot.

        Deliberately sequential, not concurrent. The bug is a stale-payload
        bug — a race is just one way to produce a stale copy — and a sequence
        reproduces it on every run, which is what a strict xfail needs. A
        gather-based version would pass whenever the driver happened not to
        interleave the reads, and strict would then fail the whole suite for
        a timing accident.
        """
        room_id = make_room_id()
        alice, bob = str(uuid.uuid4()), str(uuid.uuid4())
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            # Seating is gated on having selected a character.
            for seat_user, name in ((alice, "Alice"), (bob, "Bob")):
                await GameService.update_player_character(
                    room_id, {"user_id": seat_user, "player_name": name,
                              "character_id": str(uuid.uuid4())})

            # Bob's client took its copy of the layout while every seat was
            # empty. Alice then sits. Bob sits from his stale copy, which
            # still shows seat 0 as empty — and the whole-array write makes
            # that stale "empty" land on top of Alice.
            bobs_stale_copy = ["empty", "empty", "empty", "empty"]
            await GameService.update_seat_layout(room_id, [alice, "empty", "empty", "empty"])
            bobs_stale_copy[1] = bob
            await GameService.update_seat_layout(room_id, bobs_stale_copy)

            layout = await GameService.get_seat_layout(room_id)
            assert bob in layout, f"Bob's seat was erased: {layout}"
            assert alice in layout, f"Alice's seat was erased by Bob's stale copy: {layout}"
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
