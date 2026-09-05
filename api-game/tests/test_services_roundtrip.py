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
from shared_contracts.map import FogConfig, FogRegion, MapConfig

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

    async def test_stale_seat_copy_no_longer_erases_another_players_seat(self, mongo_up):
        """Two players joining at once must both keep their seat.

        Reproduces the original bug as a SEQUENCE, not a race: it was a
        stale-payload bug and a race was only one way to produce a stale copy.
        Bob's client took its picture of the layout while every seat was empty;
        Alice then sat; Bob sits from that stale picture. Under the old
        whole-array write his "empty" at seat 0 landed on top of Alice.

        set_seat_occupant takes only the seat being changed, so Bob's stale
        view of seat 0 is never sent and never written.
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

            await GameService.set_seat_occupant(room_id, 0, alice)
            # Bob's client still believes seat 0 is empty; it never says so.
            await GameService.set_seat_occupant(room_id, 1, bob)

            layout = await GameService.get_seat_layout(room_id)
            assert layout[0] == alice, f"Alice's seat was erased: {layout}"
            assert layout[1] == bob, f"Bob's seat is missing: {layout}"
        finally:
            await GameService.delete_room(room_id)

    async def test_simultaneous_seat_changes_both_land(self, mongo_up):
        """The concurrent form of the same thing: disjoint indexed writes."""
        room_id = make_room_id()
        alice, bob = str(uuid.uuid4()), str(uuid.uuid4())
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            for seat_user, name in ((alice, "Alice"), (bob, "Bob")):
                await GameService.update_player_character(
                    room_id, {"user_id": seat_user, "player_name": name,
                              "character_id": str(uuid.uuid4())})

            await asyncio.gather(
                GameService.set_seat_occupant(room_id, 0, alice),
                GameService.set_seat_occupant(room_id, 2, bob),
            )

            layout = await GameService.get_seat_layout(room_id)
            assert layout[0] == alice and layout[2] == bob, layout
        finally:
            await GameService.delete_room(room_id)

    async def test_seat_rules_still_enforced_on_the_resulting_layout(self, mongo_up):
        """A seating rule is about the whole party, so it is validated against
        the layout the single-seat change would produce."""
        room_id = make_room_id()
        alice = str(uuid.uuid4())
        try:
            await GameService.create_room(make_game_settings(), room_id=room_id)
            # No character selected yet — must be refused.
            await GameService.update_player_character(
                room_id, {"user_id": alice, "player_name": "Alice"})
            with pytest.raises(ValueError, match="selected characters"):
                await GameService.set_seat_occupant(room_id, 0, alice)

            # With a character, the same seat is allowed.
            await GameService.update_player_character(
                room_id, {"user_id": alice, "character_id": str(uuid.uuid4())})
            await GameService.set_seat_occupant(room_id, 0, alice)

            # Sitting twice is still a duplicate.
            with pytest.raises(ValueError, match="already occupies"):
                await GameService.set_seat_occupant(room_id, 1, alice)

            # Out-of-range index is rejected, not silently appended.
            with pytest.raises(ValueError, match="outside a layout"):
                await GameService.set_seat_occupant(room_id, 99, alice)
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


class TestScopedMapConfigWrites:
    """What a map save is allowed to touch.

    The DM's player-token size slider used to save by PUTting its whole cached
    map, which `update_complete_map` writes with `replace_one`. Nothing about
    that is a race: the DM's own fog edits are written by path and broadcast
    into the fog engine, never back into the cached map the slider sends, so
    the copy in hand is stale by design from the first brush stroke onward.

    Both tests below build their own map and delete it; neither reads anything
    another test wrote.
    """

    @staticmethod
    def _map_settings(room_id: str) -> MapSettings:
        return MapSettings(
            room_id=room_id,
            uploaded_by=str(uuid.uuid4()),
            map_config=MapConfig(
                asset_id=str(uuid.uuid4()),
                filename="scoped.png",
                file_path="maps/scoped.png",
            ),
        )

    @staticmethod
    def _painted_fog() -> dict:
        return FogConfig(regions=[FogRegion(
            id="region-1",
            name="Cave mouth",
            mask="data:image/png;base64,iVBORw0KGgo=",
            mask_width=64,
            mask_height=64,
        )]).model_dump()

    async def test_whole_map_write_from_a_stale_copy_erases_fresh_fog(self, mongo_up):
        """Evidence for why the slider left this path, NOT a regression guard.

        `update_complete_map` still backs the in-game grid save, so this test
        passes both before and after that change and must keep passing. It
        documents the cost of sending a whole document: fog painted after the
        sender took its copy is written away, with nothing raised.
        """
        room_id = make_room_id()
        service = MapService(mongo_service.db)
        try:
            await service.set_active_map(room_id, self._map_settings(room_id))

            # What a client holds: the map as it was when it last loaded.
            stale_copy = await service.get_active_map(room_id)
            del stale_copy["_id"]
            assert stale_copy["map_config"]["fog_config"] is None

            # The DM paints fog. Written by path, exactly as the fog event does.
            await service.update_fog_config(room_id, "scoped.png", self._painted_fog())

            # The DM now nudges the size slider, which sends the stale copy.
            stale_copy["map_config"]["pc_token_scale"] = 1.2
            assert await service.update_complete_map(room_id, stale_copy) is True

            after = await service.get_active_map(room_id)
            assert after["map_config"]["pc_token_scale"] == 1.2
            assert after["map_config"]["fog_config"] is None, (
                "fog painted after the client's copy was taken survived a "
                "whole-document write — the clobber this route was left for "
                "is no longer reproducible, so this test needs rewriting"
            )
        finally:
            await mongo_service.db.active_maps.delete_many({"room_id": room_id})
            await GameService.delete_room(room_id)

    async def test_scoped_scale_write_keeps_fog_painted_since_the_clients_copy(self, mongo_up):
        """The fix: write the field, leave the document alone.

        Same sequence as the test above — load, paint, then change the size —
        differing only in how the size is written. Fails before the scoped
        writer exists.
        """
        room_id = make_room_id()
        service = MapService(mongo_service.db)
        try:
            await service.set_active_map(room_id, self._map_settings(room_id))
            await service.update_fog_config(room_id, "scoped.png", self._painted_fog())

            assert await service.update_map_config(
                room_id, "scoped.png", pc_token_scale=1.2
            ) is True

            after_config = (await service.get_active_map(room_id))["map_config"]
            assert after_config["pc_token_scale"] == 1.2
            regions = after_config["fog_config"]["regions"]
            assert [region["id"] for region in regions] == ["region-1"]
            assert regions[0]["mask"] == "data:image/png;base64,iVBORw0KGgo="
        finally:
            await mongo_service.db.active_maps.delete_many({"room_id": room_id})
            await GameService.delete_room(room_id)

    async def test_a_scale_write_leaves_the_grid_alone(self, mongo_up):
        """The other cargo field on the same document."""
        room_id = make_room_id()
        service = MapService(mongo_service.db)
        try:
            await service.set_active_map(room_id, self._map_settings(room_id))
            await service.update_map_config(
                room_id, "scoped.png",
                grid_config={"grid_width": 30, "grid_height": 20, "enabled": True},
            )

            await service.update_map_config(room_id, "scoped.png", pc_token_scale=0.9)

            after_config = (await service.get_active_map(room_id))["map_config"]
            assert after_config["pc_token_scale"] == 0.9
            assert after_config["grid_config"]["grid_width"] == 30
        finally:
            await mongo_service.db.active_maps.delete_many({"room_id": room_id})
            await GameService.delete_room(room_id)


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
