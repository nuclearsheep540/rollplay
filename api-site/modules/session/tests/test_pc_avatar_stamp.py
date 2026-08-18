# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Unit tests for pc token avatar delivery at session start (tokens v3):
the roster re-stamp (decision 39) and the token_images union of board
refs + rostered avatars (decision 30).

DB-free: _stamp_pc_token_avatars is a pure static method; _build_token_images
runs against a command instance with fake repositories.
"""

from uuid import uuid4

from shared_contracts.character import PlayerCharacter, SessionUser

from modules.library.domain.image_asset_aggregate import ImageAsset
from modules.session.application.commands import StartSession


def make_session_user(user_id, avatar_asset_id=None, with_character=True):
    character = None
    if with_character:
        character = PlayerCharacter(
            user_id=user_id,
            player_name="alice",
            campaign_role="player",
            character_id=str(uuid4()),
            character_name="Aelwyn",
            character_class=["wizard"],
            character_race="elf",
            level=3,
            hp_current=20,
            hp_max=20,
            ac=13,
            avatar_asset_id=avatar_asset_id,
        )
    return SessionUser(
        user_id=user_id,
        player_name="alice",
        campaign_role="player" if with_character else "spectator",
        character=character,
    )


def pc_token(owner_user_id, image_asset_id=None):
    return {
        "id": str(uuid4()),
        "kind": "pc",
        "owner_user_id": owner_user_id,
        "character_id": str(uuid4()),
        "label": "Aelwyn",
        "x": 100.0,
        "y": 100.0,
        "footprint": 1,
        "created_by": owner_user_id,
        "updated_at": None,
        "hidden": False,
        "locked": False,
        "image_asset_id": image_asset_id,
    }


def npc_token(image_asset_id=None):
    return {
        "id": str(uuid4()),
        "kind": "npc",
        "owner_user_id": None,
        "character_id": None,
        "label": "Goblin",
        "x": 200.0,
        "y": 200.0,
        "footprint": 1,
        "created_by": "dm-user",
        "updated_at": None,
        "hidden": True,
        "locked": False,
        "image_asset_id": image_asset_id,
    }


class TestStampPcTokenAvatars:
    def test_stale_avatar_refreshes(self):
        boards = {"map-1": [pc_token("u1", image_asset_id="old-image")]}
        roster = [make_session_user("u1", avatar_asset_id="new-image")]
        stamped = StartSession._stamp_pc_token_avatars(boards, roster)
        assert stamped["map-1"][0]["image_asset_id"] == "new-image"

    def test_cleared_avatar_clears_token(self):
        boards = {"map-1": [pc_token("u1", image_asset_id="old-image")]}
        roster = [make_session_user("u1", avatar_asset_id=None)]
        stamped = StartSession._stamp_pc_token_avatars(boards, roster)
        assert stamped["map-1"][0]["image_asset_id"] is None

    def test_owner_missing_from_roster_left_untouched(self):
        boards = {"map-1": [pc_token("u-gone", image_asset_id="old-image")]}
        roster = [make_session_user("u1", avatar_asset_id="new-image")]
        stamped = StartSession._stamp_pc_token_avatars(boards, roster)
        assert stamped["map-1"][0]["image_asset_id"] == "old-image"

    def test_characterless_member_does_not_stamp(self):
        # A moderator/spectator entry has no character — their user id must
        # not clear a token they somehow own (defensive; shouldn't occur).
        boards = {"map-1": [pc_token("u1", image_asset_id="old-image")]}
        roster = [make_session_user("u1", with_character=False)]
        stamped = StartSession._stamp_pc_token_avatars(boards, roster)
        assert stamped["map-1"][0]["image_asset_id"] == "old-image"

    def test_npc_tokens_never_stamped(self):
        boards = {"map-1": [npc_token(image_asset_id="workshop-image")]}
        roster = [make_session_user("u1", avatar_asset_id="new-image")]
        stamped = StartSession._stamp_pc_token_avatars(boards, roster)
        assert stamped["map-1"][0]["image_asset_id"] == "workshop-image"


class FakeAssetRepository:
    def __init__(self, assets_by_id):
        self.assets_by_id = assets_by_id

    def get_by_id(self, asset_id):
        return self.assets_by_id.get(str(asset_id))


def make_image_asset(owner_id=None, token_area=None):
    asset = ImageAsset.create(
        user_id=owner_id or uuid4(),
        filename="portrait.png",
        s3_key=f"images/{uuid4()}.png",
        content_type="image/png",
    )
    if token_area:
        asset.set_focal_area("token", token_area)
    return asset


def make_start_session_with_assets(assets_by_id):
    command = StartSession.__new__(StartSession)  # helper under test only needs these two
    command.asset_repo = FakeAssetRepository(assets_by_id)
    command.s3_service = None
    return command


class TestBuildTokenImagesUnion:
    def test_rostered_avatar_included_without_placed_token(self):
        avatar = make_image_asset(token_area={"x": 10, "y": 20, "size": 64})
        command = make_start_session_with_assets({str(avatar.id): avatar})
        roster = [make_session_user("u1", avatar_asset_id=str(avatar.id))]
        refs = command._build_token_images({}, roster, {}, {avatar.s3_key: "https://signed"})
        assert str(avatar.id) in refs
        assert refs[str(avatar.id)].url == "https://signed"
        assert refs[str(avatar.id)].token_area.size == 64.0

    def test_board_refs_and_avatars_union(self):
        avatar = make_image_asset()
        workshop_image = make_image_asset()
        command = make_start_session_with_assets({
            str(avatar.id): avatar,
            str(workshop_image.id): workshop_image,
        })
        boards = {"map-1": [npc_token(image_asset_id=str(workshop_image.id))]}
        roster = [make_session_user("u1", avatar_asset_id=str(avatar.id))]
        refs = command._build_token_images(boards, roster, {}, {})
        assert set(refs.keys()) == {str(avatar.id), str(workshop_image.id)}

    def test_unresolvable_avatar_degrades_silently(self):
        command = make_start_session_with_assets({})
        roster = [make_session_user("u1", avatar_asset_id=str(uuid4()))]
        refs = command._build_token_images({}, roster, {}, {})
        assert refs == {}

    def test_avatarless_roster_adds_nothing(self):
        command = make_start_session_with_assets({})
        roster = [
            make_session_user("u1", avatar_asset_id=None),
            make_session_user("u2", with_character=False),
        ]
        refs = command._build_token_images({}, roster, {}, {})
        assert refs == {}
