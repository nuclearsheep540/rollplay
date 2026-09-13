# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Contract tests — round-trip serialization and shape conformance."""

import pytest
from pydantic import ValidationError

from shared_contracts.base import ContractModel
from shared_contracts.audio import AudioChannelState, AudioEffects, AudioTrackConfig
from shared_contracts.assets import AssetRef
from shared_contracts.character import DungeonMaster, PlayerCharacter, SessionUser
from shared_contracts.display import ActiveDisplayType
from shared_contracts.cine import ColorFilterOverlay, FilmGrainOverlay, HandHeldMotion, MotionConfig
from shared_contracts.grid_math import (
    grid_geometry_changed,
    grid_usable,
    resnap_token_position,
    snap_axis_nearest,
)
from shared_contracts.image import FocalArea, FocalRegion, ImageConfig, focal_center
from shared_contracts.map import (
    FOG_REGIONS_MAX,
    PC_TOKEN_SCALE_MAX,
    PC_TOKEN_SCALE_MIN,
    FogConfig,
    FogRegion,
    GridColorMode,
    GridConfig,
    MapConfig,
)
from shared_contracts.map_token import MapToken, TokenImageRef
from shared_contracts.session import (
    LogEntry,
    PlayerState,
    SessionEndFinalState,
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
    SessionStats,
)
from shared_contracts.spotify import SPOTIFY_DEFAULT_CHANNEL_LEVEL, SpotifyState
from shared_contracts.components.attribute import AttributeConfiguration, AttributeValue
from shared_contracts.components.hit_points import (
    HitPointsConfiguration,
    HitPointsValue,
    IntHitPointsRules,
    IntHitPointsState,
    ScaleStep,
    WeightedHitPointsRules,
    WeightedHitPointsState,
)
from shared_contracts.components.identity import (
    IdentityConfiguration,
    IdentityValue,
    MultiSelectIdentityAnswer,
    MultiSelectIdentityInput,
    SingleSelectIdentityAnswer,
    SingleSelectIdentityInput,
    TextIdentityAnswer,
    TextIdentityInput,
)
from shared_contracts.character_config import (
    CharacterConfig,
    CharacterSheet,
    ComponentChange,
    ComponentGroup,
    diff_configs,
)


# --- Component factories: a fresh object per call, never a module constant ---


def make_identity(component_id="identity_1", label="Name", **overrides):
    """A text identity — a name — unless `input` says otherwise."""
    input_ = overrides.pop("input", TextIdentityInput(max_length=overrides.pop("max_length", 60)))
    fields = {"id": component_id, "label": label, "secret": False, "input": input_, "required": True,
              "description": None}
    fields.update(overrides)
    return IdentityConfiguration(**fields)


def make_text_answer(component_id, text):
    return IdentityValue(component_id=component_id, answer=TextIdentityAnswer(text=text))


def make_int_hit_points(component_id="hit_points_1", label="Vitality", **overrides):
    rules = overrides.pop("rules", IntHitPointsRules(minimum=0, maximum=20))
    fields = {"id": component_id, "label": label, "secret": False, "rules": rules}
    fields.update(overrides)
    return HitPointsConfiguration(**fields)


def make_weighted_hit_points(component_id="hit_points_2", label="Resolve", **overrides):
    rules = overrides.pop("rules", WeightedHitPointsRules(
        starting_weight=1.0,
        scale=[
            ScaleStep(weight=1.0, label="Full"),
            ScaleStep(weight=0.8, label="High"),
            ScaleStep(weight=0.6, label="Mid"),
            ScaleStep(weight=0.3, label="Low"),
            ScaleStep(weight=0.0, label="Zero"),
        ],
    ))
    fields = {"id": component_id, "label": label, "secret": True, "rules": rules}
    fields.update(overrides)
    return HitPointsConfiguration(**fields)


def make_attribute(component_id="attribute_1", label="Strength", **overrides):
    fields = {"id": component_id, "label": label, "secret": False, "minimum": 1, "maximum": 20, "default": 10}
    fields.update(overrides)
    return AttributeConfiguration(**fields)


def make_mock_config():
    """The design mock's config: Name, Vitality (int 0..20 start 10), Resolve (weighted
    Full/High/Mid/Low/Zero = 1.0/0.8/0.6/0.3/0.0, secret), Strength/Agility/Wits (1..20
    default 10)."""
    return CharacterConfig(version=1, components=[
        make_identity(),
        make_int_hit_points(),
        make_weighted_hit_points(),
        make_attribute("attribute_1", "Strength"),
        make_attribute("attribute_2", "Agility"),
        make_attribute("attribute_3", "Wits"),
    ])


def make_mock_values():
    """Brannoc Vell: name, Vitality 10, Resolve 1.0, Strength 14, Agility 10, Wits 8."""
    return {
        "identity_1": make_text_answer("identity_1", "Brannoc Vell"),
        "hit_points_1": HitPointsValue(component_id="hit_points_1", state=IntHitPointsState(maximum=12, current=10)),
        "hit_points_2": HitPointsValue(component_id="hit_points_2", state=WeightedHitPointsState(current_weight=1.0)),
        "attribute_1": AttributeValue(component_id="attribute_1", score=14),
        "attribute_2": AttributeValue(component_id="attribute_2", score=10),
        "attribute_3": AttributeValue(component_id="attribute_3", score=8),
    }


def make_player_character(**overrides):
    fields = {
        "user_id": "u1",
        "player_name": "alice",
        "campaign_role": "player",
        "character_id": "char-1",
        "display_name": "Brannoc Vell",
        "config_version_id": "ver-1",
        "values": make_mock_values(),
    }
    fields.update(overrides)
    return PlayerCharacter(**fields)


# --- ContractModel base class ---


class TestContractModel:
    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            AudioChannelState(volume=0.5, unknown_field="should_fail")

    def test_valid_model_accepts_known_fields(self):
        state = AudioChannelState(volume=0.5)
        assert state.volume == 0.5


# --- Round-trip tests: model_dump → model_validate produces identical object ---


class TestAudioRoundTrip:
    def test_audio_effects_round_trip(self):
        effects = AudioEffects(eq=True, hpf=True, hpf_mix=0.7, lpf=False, lpf_mix=0.3, reverb=True, reverb_mix=1.1, reverb_preset="hall")
        assert AudioEffects.model_validate(effects.model_dump()) == effects

    def test_audio_channel_state_round_trip(self):
        state = AudioChannelState(
            filename="boss.mp3",
            asset_id="abc-123",
            s3_url="https://s3.example.com/boss.mp3",
            volume=0.9,
            looping=False,
            effects=AudioEffects(hpf=True),
            muted=True,
            soloed=False,
            loop_mode="region",
            loop_start=5.0,
            loop_end=30.0,
            playback_state="playing",
            started_at=1000.0,
        )
        assert AudioChannelState.model_validate(state.model_dump()) == state

    def test_audio_channel_state_defaults_round_trip(self):
        state = AudioChannelState()
        dumped = state.model_dump()
        assert AudioChannelState.model_validate(dumped) == state

    def test_audio_track_config_round_trip(self):
        config = AudioTrackConfig(
            volume=0.6,
            looping=True,
            effects=AudioEffects(reverb=True),
            loop_mode="continuous",
            loop_start=2.5,
            loop_end=12.0,
            paused_elapsed=45.2,
        )
        assert AudioTrackConfig.model_validate(config.model_dump()) == config


class TestMapRoundTrip:
    def test_grid_color_mode_round_trip(self):
        mode = GridColorMode(line_color="#ff0000", opacity=0.8, line_width=2)
        assert GridColorMode.model_validate(mode.model_dump()) == mode

    def test_grid_config_round_trip(self):
        config = GridConfig(
            grid_width=30,
            grid_height=25,
            enabled=False,
            colors={
                "edit_mode": GridColorMode(line_color="#ff0000"),
                "display_mode": GridColorMode(opacity=0.3),
            },
            offset_x=-5,
            offset_y=15,
        )
        assert GridConfig.model_validate(config.model_dump()) == config

    def test_map_config_round_trip(self):
        config = MapConfig(
            asset_id="map-1",
            filename="dungeon.png",
            original_filename="My Dungeon.png",
            file_path="https://s3.example.com/dungeon.png",
            grid_config=GridConfig(),
            map_image_config={"brightness": 1.2, "contrast": 0.9},
            pc_token_scale=0.75,
        )
        assert MapConfig.model_validate(config.model_dump()) == config

    def test_pc_token_scale_defaults_to_none(self):
        # None means "never set" and reads as 1.0 client-side, so a map that
        # predates the feature renders exactly as it did.
        config = MapConfig(
            asset_id="map-1", filename="dungeon.png", file_path="/dungeon.png"
        )
        assert config.pc_token_scale is None

    def test_pc_token_scale_bounds(self):
        base = {"asset_id": "map-1", "filename": "d.png", "file_path": "/d.png"}
        assert MapConfig.model_validate({**base, "pc_token_scale": 0.5}).pc_token_scale == 0.5
        assert MapConfig.model_validate({**base, "pc_token_scale": 1.5}).pc_token_scale == 1.5
        with pytest.raises(ValidationError):
            MapConfig.model_validate({**base, "pc_token_scale": 0.4})
        with pytest.raises(ValidationError):
            MapConfig.model_validate({**base, "pc_token_scale": 1.6})

    def test_pc_token_scale_bounds_are_the_exported_constants(self):
        """The Field's constraint and the module constants must stay one value.

        api-game validates an incoming scale against the constants before
        writing it, so a Field tightened without them would accept a value at
        the write boundary that this contract later refuses — and the refusal
        would land on the session-end ETL, not on the request that caused it.
        """
        constraints = MapConfig.model_fields["pc_token_scale"].metadata
        lower = next(c.ge for c in constraints if hasattr(c, "ge"))
        upper = next(c.le for c in constraints if hasattr(c, "le"))
        assert (lower, upper) == (PC_TOKEN_SCALE_MIN, PC_TOKEN_SCALE_MAX)

    def test_pc_token_scale_is_not_grid_config(self):
        # Guards the shape decision that the reverted v4 design got wrong:
        # this scales token art, it is not map geometry. If it ever migrates
        # into GridConfig, snapping and the grid re-snap start reading it.
        assert "pc_token_scale" in MapConfig.model_fields
        assert "pc_token_scale" not in GridConfig.model_fields

    def test_fog_config_defaults_round_trip(self):
        config = FogConfig()
        assert FogConfig.model_validate(config.model_dump()) == config
        assert config.regions == []
        assert config.version == 2

    def test_fog_region_defaults_round_trip(self):
        region = FogRegion(id="r1")
        assert FogRegion.model_validate(region.model_dump()) == region
        assert region.name == "Region"
        assert region.enabled is True
        assert region.role == "prepped"
        assert region.mask is None
        assert region.hide_feather_px == 20
        assert region.texture_dilate_px == 30
        assert region.opacity == 1.0

    def test_fog_region_round_trip_full(self):
        region = FogRegion(
            id="abc123",
            name="Throne Room",
            enabled=False,
            role="prepped",
            mask="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNgAAIAAAUAAen63NgAAAAASUVORK5CYII=",
            mask_width=512,
            mask_height=384,
            hide_feather_px=40,
            texture_dilate_px=80,
            opacity=0.5,
        )
        assert FogRegion.model_validate(region.model_dump()) == region

    def test_fog_region_role_must_be_prepped_or_live(self):
        # Intentionally invalid input to test Pydantic's runtime check.
        with pytest.raises(ValidationError):
            FogRegion(id="r1", role="invalid")  # type: ignore[arg-type]
        # Both valid values accepted
        FogRegion(id="r1", role="prepped")
        FogRegion(id="r2", role="live")

    def test_fog_region_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            FogRegion(id="r1", strokes=[])  # type: ignore[call-arg]

    def test_fog_region_rejects_zero_dimensions(self):
        with pytest.raises(ValidationError):
            FogRegion(id="r1", mask_width=0)
        with pytest.raises(ValidationError):
            FogRegion(id="r1", mask_height=0)

    def test_fog_region_rejects_out_of_range_params(self):
        with pytest.raises(ValidationError):
            FogRegion(id="r1", hide_feather_px=-1)
        with pytest.raises(ValidationError):
            FogRegion(id="r1", hide_feather_px=201)
        with pytest.raises(ValidationError):
            FogRegion(id="r1", texture_dilate_px=-1)
        with pytest.raises(ValidationError):
            FogRegion(id="r1", opacity=1.5)

    def test_fog_config_with_regions_round_trip(self):
        config = FogConfig(
            regions=[
                FogRegion(
                    id="r1",
                    name="North Cave",
                    mask="data:image/png;base64,iVBORw0KGgo=",
                    mask_width=256,
                    mask_height=256,
                ),
                FogRegion(
                    id="r2",
                    name="South Crypt",
                    enabled=False,
                ),
                FogRegion(
                    id="live",
                    name="Live",
                    role="live",
                ),
            ]
        )
        assert FogConfig.model_validate(config.model_dump()) == config

    def test_fog_config_caps_regions_at_max(self):
        # FOG_REGIONS_MAX entries must be accepted
        regions = [FogRegion(id=f"r{i}") for i in range(FOG_REGIONS_MAX)]
        FogConfig(regions=regions)
        # One over the cap rejected
        with pytest.raises(ValidationError):
            FogConfig(regions=regions + [FogRegion(id="overflow")])

    def test_fog_config_rejects_unknown_fields(self):
        with pytest.raises(ValidationError):
            FogConfig(regions=[], strokes=[])  # type: ignore[call-arg]

    def test_map_config_with_fog_round_trip(self):
        config = MapConfig(
            asset_id="map-1",
            filename="dungeon.png",
            file_path="https://s3.example.com/dungeon.png",
            grid_config=GridConfig(),
            fog_config=FogConfig(
                regions=[
                    FogRegion(
                        id="r1",
                        name="Default",
                        mask="data:image/png;base64,iVBORw0KGgo=",
                        mask_width=256,
                        mask_height=256,
                    ),
                ],
            ),
        )
        assert MapConfig.model_validate(config.model_dump()) == config


class TestImageRoundTrip:
    def test_image_config_round_trip(self):
        config = ImageConfig(
            asset_id="img-1",
            filename="tavern.jpg",
            original_filename="Cozy Tavern.jpg",
            file_path="https://s3.example.com/tavern.jpg",
        )
        assert ImageConfig.model_validate(config.model_dump()) == config

    def test_image_config_with_effects_round_trip(self):
        """Round-trip ImageConfig with visual overlays and motion as top-level fields."""
        config = ImageConfig(
            asset_id="img-2",
            filename="castle.jpg",
            original_filename="Dark Castle.jpg",
            file_path="https://s3.example.com/castle.jpg",
            image_fit="letterbox",
            display_mode="cine",
            visual_overlays=[
                FilmGrainOverlay(opacity=0.3, style="grain", blend_mode="overlay"),
                ColorFilterOverlay(opacity=0.6, color="#1a0a2e", blend_mode="multiply"),
            ],
            motion=MotionConfig(
                hand_held=HandHeldMotion(track_points=5, distance=12, speed=7, x_bias=30, randomness=40),
            ),
        )
        rebuilt = ImageConfig.model_validate(config.model_dump())
        assert rebuilt == config
        # Verify discriminator survived the round-trip
        assert rebuilt.visual_overlays[0].type == "film_grain"
        assert rebuilt.visual_overlays[1].type == "color_filter"
        # Verify motion survived the round-trip
        assert rebuilt.motion.hand_held.track_points == 5
        assert rebuilt.motion.hand_held.x_bias == 30

    def test_image_config_legacy_cine_fit_coercion(self):
        """Legacy image_fit='cine' is coerced to 'letterbox'."""
        config = ImageConfig(
            asset_id="img-3",
            filename="old.jpg",
            file_path="https://s3.example.com/old.jpg",
            image_fit="cine",
        )
        assert config.image_fit == "letterbox"


class TestOverlayValidation:
    def test_overlay_discriminator_from_dict(self):
        """Ensure the discriminated union deserializes correctly from raw dicts."""
        raw = {
            "asset_id": "img-1",
            "filename": "test.jpg",
            "file_path": "https://example.com/test.jpg",
            "visual_overlays": [
                {"type": "film_grain", "opacity": 0.5, "style": "vintage", "blend_mode": "overlay", "enabled": True},
                {"type": "color_filter", "opacity": 0.4, "color": "#000000", "blend_mode": "multiply", "enabled": True},
            ],
        }
        config = ImageConfig.model_validate(raw)
        assert isinstance(config.visual_overlays[0], FilmGrainOverlay)
        assert isinstance(config.visual_overlays[1], ColorFilterOverlay)

    def test_motion_round_trip(self):
        motion = MotionConfig(
            hand_held=HandHeldMotion(track_points=8, distance=15, speed=5, x_bias=-50),
        )
        assert MotionConfig.model_validate(motion.model_dump()) == motion

    def test_motion_with_only_ken_burns_placeholder(self):
        motion = MotionConfig(ken_burns={"some": "future_data"})
        rebuilt = MotionConfig.model_validate(motion.model_dump())
        assert rebuilt.hand_held is None
        assert rebuilt.ken_burns == {"some": "future_data"}


class TestMotionConstraints:
    def test_track_points_rejects_below_min(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(track_points=1)

    def test_track_points_rejects_above_max(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(track_points=31)

    def test_distance_rejects_below_min(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(distance=1)

    def test_distance_rejects_above_max(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(distance=21)

    def test_speed_rejects_below_min(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(speed=0)

    def test_speed_rejects_above_max(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(speed=16)

    def test_x_bias_rejects_below_min(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(x_bias=-101)

    def test_x_bias_rejects_above_max(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(x_bias=101)

    def test_randomness_rejects_below_min(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(randomness=-1)

    def test_randomness_rejects_above_max(self):
        with pytest.raises(ValidationError):
            HandHeldMotion(randomness=101)

    def test_accepts_boundary_values(self):
        hh = HandHeldMotion(track_points=2, distance=2, speed=1, x_bias=-100)
        assert hh.track_points == 2
        hh = HandHeldMotion(track_points=30, distance=20, speed=15, x_bias=100)
        assert hh.track_points == 30


class TestSpotifyRoundTrip:
    def test_spotify_state_full_round_trip(self):
        """The complete shape the api-game snapshot builders write to MongoDB."""
        state = SpotifyState(
            track_uri="spotify:track:abc123",
            track_meta={"name": "Tavern Theme", "artist": "Bard Co", "art_url": None, "duration_ms": 213000},
            context_uri="spotify:playlist:xyz789",
            playback_state="playing",
            started_at=1751970000.5,
            paused_elapsed=None,
            is_looping=False,
            channel_level=0.8,
            updated_by="user-1",
        )
        assert SpotifyState.model_validate(state.model_dump()) == state

    def test_spotify_state_defaults_round_trip(self):
        state = SpotifyState()
        assert SpotifyState.model_validate(state.model_dump()) == state

    def test_spotify_state_restore_shape_round_trip(self):
        """The cold->hot restore path adds is_playing alongside a paused state."""
        state = SpotifyState(
            track_uri="spotify:track:abc123",
            playback_state="paused",
            paused_elapsed=42.5,
            is_playing=False,
            channel_level=0.5,
        )
        assert SpotifyState.model_validate(state.model_dump()) == state

    def test_empty_dict_fills_all_defaults(self):
        """A pre-contract MongoDB document ({} spotify block) normalises cleanly."""
        state = SpotifyState.model_validate({})
        assert state.track_uri is None
        assert state.playback_state == "stopped"
        assert state.channel_level == SPOTIFY_DEFAULT_CHANNEL_LEVEL


class TestSpotifyShapeConformance:
    def test_spotify_state_has_required_fields(self):
        required_keys = {
            "track_uri", "track_meta", "context_uri", "playback_state",
            "started_at", "paused_elapsed", "is_looping", "is_playing",
            "channel_level", "updated_by",
        }
        assert required_keys.issubset(set(SpotifyState.model_fields.keys()))

    def test_default_channel_level_is_minus_12_db(self):
        # -12 dB in linear gain; the FE mirrors this in useSpotifyPlayback.js
        assert SpotifyState().channel_level == pytest.approx(10 ** (-12 / 20))
        assert SPOTIFY_DEFAULT_CHANNEL_LEVEL == pytest.approx(0.2511886, abs=1e-6)


class TestSpotifyConstraints:
    def test_channel_level_rejects_above_max(self):
        with pytest.raises(ValidationError):
            SpotifyState(channel_level=1.1)

    def test_channel_level_rejects_below_min(self):
        with pytest.raises(ValidationError):
            SpotifyState(channel_level=-0.1)

    def test_channel_level_accepts_boundary_values(self):
        assert SpotifyState(channel_level=0.0).channel_level == 0.0
        assert SpotifyState(channel_level=1.0).channel_level == 1.0

    def test_playback_state_rejects_invalid(self):
        with pytest.raises(ValidationError):
            SpotifyState(playback_state="rewinding")  # type: ignore[arg-type]

    def test_playback_state_accepts_all_valid(self):
        for value in ("stopped", "playing", "paused"):
            assert SpotifyState(playback_state=value).playback_state == value

    def test_rejects_unknown_fields(self):
        # extra='forbid': drift between the builders and the contract fails loudly
        with pytest.raises(ValidationError):
            SpotifyState(volume=0.5)  # type: ignore[call-arg]


class TestSessionRoundTrip:
    def test_session_start_payload_round_trip(self):
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
            max_players=6,
            joined_user_ids=["u1", "u2"],
            session_users=[
                SessionUser(
                    user_id="u1",
                    player_name="alice",
                    campaign_role="player",
                    character=make_player_character(color="#3b82f6", avatar_asset_id="img-asset-1"),
                ),
                SessionUser(
                    user_id="u2",
                    player_name="bob",
                    campaign_role="spectator",
                ),
            ],
            assets=[AssetRef(id="a1", filename="map.png", s3_key="maps/map.png", asset_type="map")],
            audio_config={"channel_0": AudioChannelState(filename="bgm.mp3", volume=0.7)},
            spotify_state=SpotifyState(track_uri="spotify:track:abc", playback_state="paused", paused_elapsed=12.0),
            map_config=MapConfig(asset_id="m1", filename="dungeon.png", file_path="https://s3.example.com/dungeon.png"),
            active_display=ActiveDisplayType.MAP,
        )
        assert SessionStartPayload.model_validate(payload.model_dump()) == payload

    def test_session_start_payload_coerces_spotify_dict(self):
        """api-site passes session.spotify_config (a raw JSONB dict) — the contract coerces + defaults it."""
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
            spotify_state={"track_uri": "spotify:track:abc", "channel_level": 0.9},
        )
        assert isinstance(payload.spotify_state, SpotifyState)
        assert payload.spotify_state.channel_level == 0.9
        assert payload.spotify_state.playback_state == "stopped"  # contract default fills the gap

    def test_session_start_payload_defaults_spotify_state(self):
        """A session with no persisted Spotify config starts at the contract defaults (-12 dB)."""
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
        )
        assert payload.spotify_state.channel_level == SPOTIFY_DEFAULT_CHANNEL_LEVEL

    def test_session_start_payload_minimal_round_trip(self):
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
        )
        assert SessionStartPayload.model_validate(payload.model_dump()) == payload

    def test_session_end_final_state_round_trip(self):
        state = SessionEndFinalState(
            players=[
                # Seated player with a character-owned color
                PlayerState(user_id="u1", player_name="Alice", seat_position=0, character_id="char-1", color="#FF6B6B"),
                # Known-but-unseated player still round-trips (color sync coverage)
                PlayerState(user_id="u2", player_name="Bob"),
            ],
            session_stats=SessionStats(duration_minutes=120, total_logs=47),
            audio_state={"channel_0": AudioChannelState(volume=0.5, playback_state="paused")},
            spotify_state=SpotifyState(track_uri="spotify:track:abc", playback_state="paused", paused_elapsed=98.4, channel_level=0.3),
            map_state=MapConfig(asset_id="m1", filename="map.png", file_path="https://s3.example.com/map.png"),
            active_display=ActiveDisplayType.IMAGE,
            adventure_log=[
                LogEntry(
                    message="Alice rolled a d20: 17",
                    type="player-roll",
                    timestamp="2026-07-19T18:30:00+00:00",
                    from_player="u1",
                    log_id=1752950000000000,
                ),
                LogEntry(
                    message="Combat started by dm_user",
                    type="system",
                    timestamp="2026-07-19T18:31:00+00:00",
                    log_id=1752950060000000,
                    prompt_id="prompt-1",
                ),
            ],
        )
        assert SessionEndFinalState.model_validate(state.model_dump()) == state

    def test_log_entry_round_trip(self):
        entry = LogEntry(
            message="DM prompted all players for Initiative",
            type="dungeon-master",
            timestamp="2026-07-19T18:32:00+00:00",
            from_player="u-dm",
            log_id=1752950120000000,
        )
        assert LogEntry.model_validate(entry.model_dump()) == entry
        assert entry.prompt_id is None

    def test_session_end_response_round_trip(self):
        response = SessionEndResponse(
            success=True,
            final_state=SessionEndFinalState(),
            message="Session ended",
        )
        assert SessionEndResponse.model_validate(response.model_dump()) == response

    def test_session_start_response_round_trip(self):
        response = SessionStartResponse(success=True, game_id="s1", message="Started")
        assert SessionStartResponse.model_validate(response.model_dump()) == response

    def test_start_addresses_the_room_by_game_id_on_both_legs(self):
        """The id api-site sends is the id api-game must key by and echo back.

        Both legs name it `game_id` so the room's identity cannot drift from the
        game's: they are the same thing, and a second name is how they diverge.
        """
        game_id = "0f3d6e6a-6f5e-4a1e-9c7a-2a1b3c4d5e6f"
        payload = SessionStartPayload(
            game_id=game_id,
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="dm", player_name="Matt"),
        )
        response = SessionStartResponse(success=True, game_id=payload.game_id)

        assert response.game_id == payload.game_id
        assert "session_id" not in SessionStartPayload.model_fields
        assert "session_id" not in SessionStartResponse.model_fields


# --- Shape conformance tests: catch schema drift ---


class TestAudioShapeConformance:
    def test_audio_channel_state_has_required_fields(self):
        required_keys = {
            "filename", "asset_id", "s3_url", "volume", "looping",
            "effects", "muted", "soloed", "playback_state",
            "started_at", "paused_elapsed",
        }
        assert required_keys.issubset(set(AudioChannelState.model_fields.keys()))

    def test_audio_effects_shape(self):
        effects = AudioEffects()
        dumped = effects.model_dump()
        expected_types = {
            "eq": bool,
            "hpf": bool,
            "hpf_mix": float,
            "lpf": bool,
            "lpf_mix": float,
            "reverb": bool,
            "reverb_mix": float,
            "reverb_preset": str,
        }
        assert set(dumped.keys()) == set(expected_types.keys())
        for key, expected_type in expected_types.items():
            assert isinstance(dumped[key], expected_type), f"{key} should be {expected_type.__name__}"

    def test_audio_track_config_has_required_fields(self):
        required_keys = {"volume", "looping", "effects", "paused_elapsed"}
        assert required_keys.issubset(set(AudioTrackConfig.model_fields.keys()))


class TestMapShapeConformance:
    def test_map_config_has_required_fields(self):
        required_keys = {"asset_id", "filename", "file_path", "grid_config", "map_image_config"}
        assert required_keys.issubset(set(MapConfig.model_fields.keys()))

    def test_grid_config_has_required_fields(self):
        required_keys = {"grid_width", "grid_height", "enabled", "colors", "offset_x", "offset_y"}
        assert required_keys.issubset(set(GridConfig.model_fields.keys()))


class TestCharacterConfigEtl:
    def test_start_payload_carries_config_versions(self):
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
            character_configs={"ver-1": make_mock_config()},
        )
        revalidated = SessionStartPayload.model_validate_json(payload.model_dump_json())
        assert revalidated.character_configs["ver-1"] == make_mock_config()

    def test_start_payload_defaults_to_no_configs(self):
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
        )
        assert payload.character_configs == {}

    def test_start_payload_rejects_a_config_that_is_not_one(self):
        with pytest.raises(ValidationError):
            SessionStartPayload(
                game_id="s1",
                campaign_id="c1",
                dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
                character_configs={"ver-1": {"version": 1, "components": "not a list"}},
            )

    def test_two_players_on_two_versions_both_travel(self):
        """A config edit must not force anyone to rebuild: both versions ride along."""
        older = make_mock_config()
        newer = CharacterConfig(version=2, components=[make_identity()])
        payload = SessionStartPayload(
            game_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
            character_configs={"ver-1": older, "ver-2": newer},
        )
        assert set(payload.character_configs) == {"ver-1", "ver-2"}

    def test_player_state_round_trips_values_home(self):
        state = PlayerState(
            user_id="u1", player_name="alice", character_id="char-1",
            config_version_id="ver-1", values=make_mock_values(), color="#3b82f6")
        revalidated = PlayerState.model_validate_json(state.model_dump_json())
        assert revalidated == state
        assert revalidated.values["hit_points_1"].state.current == 10

    def test_player_state_defaults_for_a_player_with_no_character(self):
        state = PlayerState(user_id="u2", player_name="bob")
        assert state.config_version_id is None
        assert state.values == {}


class TestSessionShapeConformance:
    def test_session_start_payload_has_required_fields(self):
        required_keys = {
            "game_id", "campaign_id", "dungeon_master", "max_players",
            "joined_user_ids", "session_users", "assets", "audio_config", "audio_track_config",
            "spotify_state", "map_config", "image_config", "active_display",
        }
        assert required_keys.issubset(set(SessionStartPayload.model_fields.keys()))


class TestCharacterShapeConformance:
    def test_player_character_has_required_fields(self):
        required_keys = {
            "user_id", "player_name", "campaign_role", "character_id",
            "display_name", "config_version_id", "values",
        }
        assert required_keys.issubset(set(PlayerCharacter.model_fields.keys()))

    def test_player_character_carries_no_ruleset_fields(self):
        """The runtime renders whatever the values are, by component type. A payload
        carrying the old D&D field set must fail loudly, not be silently ignored."""
        for dead_field in ("character_name", "character_class", "character_race",
                           "level", "hp_current", "hp_max", "ac"):
            assert dead_field not in PlayerCharacter.model_fields
            with pytest.raises(ValidationError):
                make_player_character(**{dead_field: 1})

    def test_player_character_round_trips_values(self):
        character = make_player_character()
        revalidated = PlayerCharacter.model_validate_json(character.model_dump_json())
        assert revalidated == character
        assert revalidated.values["attribute_1"].score == 14

    def test_player_character_avatar_defaults_none(self):
        # tokens v3 (decision 30): avatar is optional wire baggage — old
        # payloads without it must revalidate cleanly, and its absence
        # means "color disc" downstream.
        character = make_player_character()
        assert character.avatar_asset_id is None
        stamped = PlayerCharacter.model_validate(
            {**character.model_dump(), "avatar_asset_id": "img-1"}
        )
        assert stamped.avatar_asset_id == "img-1"

    def test_player_character_defaults_to_no_values(self):
        assert make_player_character(values={}).values == {}

    def test_session_end_final_state_has_required_fields(self):
        required_keys = {
            "players", "session_stats", "audio_state", "audio_track_config",
            "spotify_state", "map_state", "image_state", "active_display",
        }
        assert required_keys.issubset(set(SessionEndFinalState.model_fields.keys()))

    def test_seat_count_travels_cold_to_hot_only(self):
        """Seats are campaign settings: the start payload carries them, the end
        report must not. A seat count coming back from a running game would
        overwrite an edit made in campaign settings while it was live."""
        assert "max_players" in SessionStartPayload.model_fields
        assert "max_players" not in SessionStats.model_fields


# --- Constraint validation tests: contracts reject invalid data ---


class TestAudioConstraints:
    def test_volume_rejects_above_max(self):
        # Fader ceiling is 1.5 (= +3.52 dB). Anything above should reject.
        with pytest.raises(ValidationError):
            AudioChannelState(volume=1.6)

    def test_volume_rejects_below_min(self):
        with pytest.raises(ValidationError):
            AudioChannelState(volume=-0.1)

    def test_volume_accepts_boundary_values(self):
        assert AudioChannelState(volume=0.0).volume == 0.0
        assert AudioChannelState(volume=1.5).volume == 1.5

    def test_playback_state_rejects_invalid(self):
        with pytest.raises(ValidationError):
            AudioChannelState(playback_state="rewinding")

    def test_started_at_rejects_negative(self):
        with pytest.raises(ValidationError):
            AudioChannelState(started_at=-1.0)

    def test_track_config_volume_rejects_above_max(self):
        with pytest.raises(ValidationError):
            AudioTrackConfig(volume=1.6)

    def test_reverb_mix_accepts_boundary(self):
        # Reverb mix tracks the same fader ceiling as volume (1.5 = +3.52 dB).
        assert AudioEffects(reverb_mix=1.5).reverb_mix == 1.5

    def test_reverb_mix_rejects_above_max(self):
        with pytest.raises(ValidationError):
            AudioEffects(reverb_mix=1.6)


class TestMapConstraints:
    def test_grid_width_rejects_zero(self):
        with pytest.raises(ValidationError):
            GridConfig(grid_width=0)

    def test_grid_width_rejects_above_max(self):
        with pytest.raises(ValidationError):
            GridConfig(grid_width=1001)

    def test_grid_opacity_rejects_above_max(self):
        with pytest.raises(ValidationError):
            GridColorMode(opacity=1.1)

    def test_map_config_rejects_empty_asset_id(self):
        with pytest.raises(ValidationError):
            MapConfig(asset_id="", filename="test.png", file_path="/test")

    def test_grid_offset_accepts_negative(self):
        config = GridConfig(offset_x=-50, offset_y=-50)
        assert config.offset_x == -50
        assert config.offset_y == -50


class TestMapTokenRoundTrip:
    def _valid_token(self, **overrides):
        token = {
            "id": "3f1c9a2e-0000-4000-8000-000000000001",
            "kind": "pc",
            "owner_user_id": "user-1",
            "character_id": "char-1",
            "x": 512.5,
            "y": 384.0,
            "created_by": "user-1",
        }
        token.update(overrides)
        return token

    def test_round_trip_preserves_fields(self):
        token = MapToken.model_validate(self._valid_token())
        restored = MapToken.model_validate(token.model_dump())
        assert restored == token

    def test_defaults(self):
        token = MapToken.model_validate(self._valid_token())
        assert token.footprint == 1
        assert token.label is None
        assert token.updated_at is None

    def test_npc_token_needs_no_owner(self):
        token = MapToken.model_validate(
            self._valid_token(kind="npc", owner_user_id=None, character_id=None, label="Goblin 3")
        )
        assert token.owner_user_id is None
        assert token.label == "Goblin 3"


class TestMapTokenConstraints:
    def _valid_token(self, **overrides):
        token = {
            "id": "token-1",
            "kind": "pc",
            "x": 0.0,
            "y": 0.0,
            "created_by": "user-1",
        }
        token.update(overrides)
        return token

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(color="#ff0000"))

    def test_rejects_unknown_kind(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(kind="monster"))

    def test_rejects_empty_id(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(id=""))

    def test_rejects_non_finite_coordinates(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(x=float("inf")))
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(y=float("nan")))

    def test_footprint_bounds(self):
        assert MapToken.model_validate(self._valid_token(footprint=4)).footprint == 4
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(footprint=0))
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(footprint=5))

    def test_label_rejects_oversized(self):
        with pytest.raises(ValidationError):
            MapToken.model_validate(self._valid_token(label="x" * 65))


class TestMapTokenSessionEtl:
    def _board(self):
        return {
            "asset-1": [
                {
                    "id": "token-1", "kind": "pc", "owner_user_id": "user-1",
                    "character_id": "char-1", "x": 100.0, "y": 200.0,
                    "footprint": 1, "created_by": "user-1",
                    "updated_at": "2026-07-20T12:00:00+00:00",
                },
                {
                    "id": "token-2", "kind": "npc", "label": "Goblin 3",
                    "x": 300.0, "y": 400.0, "footprint": 2, "created_by": "dm-1",
                },
            ]
        }

    def test_start_payload_round_trips_token_boards(self):
        payload = SessionStartPayload(
            game_id="s1", campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="dm-1", player_name="Matt"),
            map_token_state=self._board(),
        )
        restored = SessionStartPayload.model_validate(payload.model_dump())
        assert restored == payload
        assert restored.map_token_state["asset-1"][0].id == "token-1"

    def test_final_state_round_trips_token_boards(self):
        final_state = SessionEndFinalState(map_token_state=self._board())
        restored = SessionEndFinalState.model_validate(final_state.model_dump())
        assert restored == final_state
        assert restored.map_token_state["asset-1"][1].label == "Goblin 3"

    def test_token_boards_default_empty(self):
        assert SessionEndFinalState().map_token_state == {}

    def test_malformed_board_token_rejected(self):
        board = self._board()
        board["asset-1"][0]["x"] = float("nan")
        with pytest.raises(ValidationError):
            SessionEndFinalState(map_token_state=board)


# --- Tokens v2: DM flags, companions, images (decisions 16-28) ---


class TestMapTokenV2Flags:
    def _npc_token(self, **overrides):
        token = {
            "id": "npc-1",
            "kind": "npc",
            "x": 100.0,
            "y": 200.0,
            "created_by": "dm-1",
        }
        token.update(overrides)
        return token

    def test_v2_fields_round_trip(self):
        token = MapToken.model_validate(self._npc_token(
            hidden=True, locked=True, image_asset_id="img-1", label="Goblin"))
        restored = MapToken.model_validate(token.model_dump())
        assert restored == token
        assert restored.hidden is True
        assert restored.locked is True
        assert restored.image_asset_id == "img-1"

    def test_v2_fields_default_off(self):
        token = MapToken.model_validate(self._npc_token())
        assert token.hidden is False
        assert token.locked is False
        assert token.image_asset_id is None

    def test_v1_stored_dicts_still_validate(self):
        # Boards persisted before v2 carry none of the new keys — defaults
        # must absorb them (the ETL revalidates per token at session start).
        v1_token = {
            "id": "old-1", "kind": "pc", "owner_user_id": "user-1",
            "character_id": "char-1", "x": 1.0, "y": 2.0,
            "footprint": 1, "created_by": "user-1",
            "updated_at": "2026-07-20T12:00:00+00:00",
        }
        assert MapToken.model_validate(v1_token).hidden is False

    def test_pc_cannot_hide_or_lock(self):
        pc_token = {
            "id": "pc-1", "kind": "pc", "owner_user_id": "user-1",
            "x": 1.0, "y": 2.0, "created_by": "user-1",
        }
        with pytest.raises(ValidationError):
            MapToken.model_validate({**pc_token, "hidden": True})
        with pytest.raises(ValidationError):
            MapToken.model_validate({**pc_token, "locked": True})

    def test_npc_companion_assignment_validates(self):
        # An assigned npc token is a player's minion/companion — the
        # assignment (owner_user_id) is the player-side signal.
        token = MapToken.model_validate(self._npc_token(owner_user_id="player-1"))
        assert token.owner_user_id == "player-1"


class TestFocalRegionConstraints:
    """The rectangular sibling of FocalArea, for purposes whose consumer is not square —
    a campaign card is 16:4, and a square can only say where its centre is."""

    def test_round_trip(self):
        region = FocalRegion(x=10.0, y=20.0, width=1600.0, height=400.0)
        assert FocalRegion.model_validate(region.model_dump()) == region

    def test_zero_or_negative_extent_rejected(self):
        with pytest.raises(ValidationError):
            FocalRegion(x=0.0, y=0.0, width=0.0, height=10.0)
        with pytest.raises(ValidationError):
            FocalRegion(x=0.0, y=0.0, width=10.0, height=-1.0)

    def test_negative_position_rejected(self):
        with pytest.raises(ValidationError):
            FocalRegion(x=-1.0, y=0.0, width=10.0, height=10.0)

    def test_non_finite_rejected(self):
        with pytest.raises(ValidationError):
            FocalRegion(x=0.0, y=0.0, width=float("inf"), height=10.0)

    def test_extra_fields_forbidden(self):
        """A region carries width and height; `size` is the square's word and may not
        ride along, or a consumer could not tell which shape it holds."""
        with pytest.raises(ValidationError):
            FocalRegion.model_validate({"x": 0.0, "y": 0.0, "width": 10.0, "height": 5.0, "size": 10.0})

    def test_a_square_dict_is_not_a_region(self):
        with pytest.raises(ValidationError):
            FocalRegion.model_validate({"x": 0.0, "y": 0.0, "size": 10.0})


class TestFocalCenter:
    """Consumers bias a cover-fit image toward the area's centre, whichever shape it is."""

    def test_square_center(self):
        assert focal_center(FocalArea(x=100.0, y=50.0, size=200.0)) == (200.0, 150.0)

    def test_region_center(self):
        assert focal_center(FocalRegion(x=100.0, y=50.0, width=1600.0, height=400.0)) == (900.0, 250.0)

    def test_raw_dicts_of_either_shape(self):
        assert focal_center({"x": 0, "y": 0, "size": 10}) == (5.0, 5.0)
        assert focal_center({"x": 0, "y": 0, "width": 10, "height": 4}) == (5.0, 2.0)


class TestFocalAreaConstraints:
    def test_round_trip(self):
        area = FocalArea(x=340.0, y=120.0, size=512.0)
        assert FocalArea.model_validate(area.model_dump()) == area

    def test_origin_square_is_valid(self):
        area = FocalArea(x=0, y=0, size=1)
        assert area.size == 1.0

    def test_negative_position_rejected(self):
        with pytest.raises(ValidationError):
            FocalArea(x=-1.0, y=0.0, size=10.0)
        with pytest.raises(ValidationError):
            FocalArea(x=0.0, y=-1.0, size=10.0)

    def test_zero_or_negative_size_rejected(self):
        with pytest.raises(ValidationError):
            FocalArea(x=0.0, y=0.0, size=0.0)
        with pytest.raises(ValidationError):
            FocalArea(x=0.0, y=0.0, size=-5.0)

    def test_non_finite_rejected(self):
        with pytest.raises(ValidationError):
            FocalArea(x=float("inf"), y=0.0, size=10.0)
        with pytest.raises(ValidationError):
            FocalArea(x=0.0, y=0.0, size=float("nan"))

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            FocalArea.model_validate({"x": 0.0, "y": 0.0, "size": 1.0, "width": 2.0})


class TestTokenImageRefRoundTrip:
    def test_full_ref_round_trips(self):
        ref = TokenImageRef(
            url="https://cdn.example.com/goblin.png?sig=abc",
            token_area=FocalArea(x=10.0, y=20.0, size=64.0),
        )
        assert TokenImageRef.model_validate(ref.model_dump()) == ref

    def test_defaults_degrade_to_color_disc(self):
        # None url / None area are the client's fall-back-to-color-disc and
        # render-full-image signals respectively.
        ref = TokenImageRef()
        assert ref.url is None
        assert ref.token_area is None


class TestSessionTokenImages:
    def test_start_payload_round_trips_token_images(self):
        payload = SessionStartPayload(
            game_id="s1", campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="dm-1", player_name="Matt"),
            token_images={
                "img-1": {"url": "https://cdn.example.com/a.png", "token_area": {"x": 1.0, "y": 2.0, "size": 3.0}},
                "img-2": {"url": None, "token_area": None},
            },
        )
        restored = SessionStartPayload.model_validate(payload.model_dump())
        assert restored == payload
        assert restored.token_images["img-1"].token_area.size == 3.0

    def test_token_images_default_empty(self):
        payload = SessionStartPayload(
            game_id="s1", campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="dm-1", player_name="Matt"),
        )
        assert payload.token_images == {}

    def test_start_payload_has_token_fields(self):
        required_keys = {"map_token_state", "token_images"}
        assert required_keys.issubset(set(SessionStartPayload.model_fields.keys()))


class TestGridMath:
    """Core behavioral cases so this package's CI exercises grid_math
    standalone — the exhaustive suite lives in api-game/tests/test_grid_math.py."""

    def _grid(self, **overrides):
        grid_config = {
            "enabled": True,
            "grid_width": 20,
            "grid_height": 10,
            "offset_x": 0,
            "offset_y": 0,
            "grid_cell_size": 100.0,
        }
        grid_config.update(overrides)
        return grid_config

    def test_grid_usable_guard(self):
        assert grid_usable(self._grid()) is True
        assert grid_usable(None) is False
        assert grid_usable(self._grid(enabled=False)) is False
        assert grid_usable(self._grid(grid_cell_size=None)) is False

    def test_cosmetic_change_is_not_geometry(self):
        cosmetic = self._grid()
        cosmetic["opacity"] = 0.4
        assert grid_geometry_changed(self._grid(), cosmetic) is False
        assert grid_geometry_changed(self._grid(), self._grid(grid_cell_size=80.0)) is True

    def test_exact_cell_preserved_across_resize(self):
        # Token centered in cell (3, 6) at 100px cells stays in (3, 6) at 80px.
        new_x, new_y = resnap_token_position(350.0, 650.0, 1, self._grid(), self._grid(grid_cell_size=80.0))
        assert (new_x, new_y) == (3 * 80.0 + 40.0, 6 * 80.0 + 40.0)

    def test_removed_columns_clamp(self):
        new_x, _new_y = resnap_token_position(1850.0, 250.0, 1, self._grid(), self._grid(grid_width=10))
        assert new_x == 950.0

    def test_gridless_history_snaps_nearest(self):
        assert resnap_token_position(340.0, 620.0, 1, None, self._grid()) == (350.0, 650.0)

    def test_unusable_new_grid_leaves_position(self):
        assert resnap_token_position(123.4, 567.8, 1, self._grid(), None) == (123.4, 567.8)

    def test_nearest_snap_rounds_half_up_like_js(self):
        # Math.round(2.5) === 3 in JS; Python's round() is banker's — the
        # shared math must match the client's snapTokenCenter.
        assert snap_axis_nearest(250.0, 0, 100.0, 2) == 300.0


# --- Character components ---


class TestIdentityComponent:
    """Who or what the character is, answered the way the GM chose: free text, one choice
    from a list, or several."""

    def test_text_configuration_round_trip(self):
        configuration = make_identity(label="First name", max_length=40)
        assert IdentityConfiguration.model_validate(configuration.model_dump()) == configuration

    def test_select_configurations_round_trip(self):
        single = make_identity(input=SingleSelectIdentityInput(options=["Rogue", "Mage"]))
        multi = make_identity(input=MultiSelectIdentityInput(options=["Guard", "Cook"]))
        assert IdentityConfiguration.model_validate(single.model_dump()) == single
        assert IdentityConfiguration.model_validate(multi.model_dump()) == multi

    def test_input_is_required(self):
        """No silent shape: the GM says how an identity is answered."""
        with pytest.raises(ValidationError):
            IdentityConfiguration(id="identity_1", label="Name")

    def test_value_round_trips_for_every_kind(self):
        for value in (
            make_text_answer("identity_1", "Brannoc Vell"),
            IdentityValue(component_id="identity_1", answer=SingleSelectIdentityAnswer(choice="Rogue")),
            IdentityValue(component_id="identity_1", answer=MultiSelectIdentityAnswer(choices=["Guard", "Cook"])),
        ):
            assert IdentityValue.model_validate(value.model_dump()) == value

    def test_extra_fields_forbidden(self):
        with pytest.raises(ValidationError):
            IdentityConfiguration(id="identity_1", label="Name", input=TextIdentityInput(), nickname="nope")
        with pytest.raises(ValidationError):
            IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="x"), nickname="nope")

    def test_max_length_above_platform_ceiling_rejected(self):
        with pytest.raises(ValidationError):
            make_identity(max_length=201)

    def test_empty_label_rejected(self):
        with pytest.raises(ValidationError):
            make_identity(label="")

    def test_options_must_be_present_distinct_and_non_blank(self):
        with pytest.raises(ValidationError):
            SingleSelectIdentityInput(options=[])
        with pytest.raises(ValidationError):
            SingleSelectIdentityInput(options=["Rogue", "Rogue"])
        with pytest.raises(ValidationError):
            MultiSelectIdentityInput(options=["Guard", "  "])

    def test_multi_select_choices_distinct(self):
        with pytest.raises(ValidationError):
            MultiSelectIdentityAnswer(choices=["Guard", "Guard"])

    def test_is_populated_per_kind(self):
        assert make_text_answer("identity_1", "Brannoc").is_populated()
        assert not make_text_answer("identity_1", "   ").is_populated()
        assert IdentityValue(component_id="identity_1", answer=SingleSelectIdentityAnswer(choice="Rogue")).is_populated()
        assert IdentityValue(component_id="identity_1", answer=MultiSelectIdentityAnswer(choices=["Guard"])).is_populated()
        assert not IdentityValue(component_id="identity_1", answer=MultiSelectIdentityAnswer(choices=[])).is_populated()


class TestIntHitPoints:
    def test_round_trip(self):
        configuration = make_int_hit_points()
        assert HitPointsConfiguration.model_validate(configuration.model_dump()) == configuration

    def test_minimum_above_maximum_rejected(self):
        with pytest.raises(ValidationError):
            IntHitPointsRules(minimum=11, maximum=10)

    def test_equal_bounds_fix_the_maximum(self):
        """A GM may say "you start with 10 and cannot change it": no range to choose from."""
        assert IntHitPointsRules(minimum=10, maximum=10).maximum == 10

    def test_negative_minimum_rejected(self):
        """A maximum cannot be set below zero, so the bound on it cannot be either."""
        with pytest.raises(ValidationError):
            IntHitPointsRules(minimum=-1, maximum=20)

    def test_no_starting_value(self):
        """The entry is the character's maximum; nothing starts anywhere else."""
        with pytest.raises(ValidationError):
            IntHitPointsRules(minimum=0, maximum=20, starting=10)

    def test_state_round_trip(self):
        state = IntHitPointsState(maximum=12, current=7)
        assert IntHitPointsState.model_validate(state.model_dump()) == state

    def test_state_accepts_numbers_outside_the_rules(self):
        """The value model is range-blind by design. A maximum the GM would no longer accept
        at entry, or a current above the maximum, is a version difference (axis 2, surfaced
        by diff_configs), never a data invariant — so the leaf must accept it."""
        assert IntHitPointsState(maximum=9999, current=9999).current == 9999
        assert IntHitPointsState(maximum=5, current=40).current == 40

    def test_state_rejects_negatives(self):
        with pytest.raises(ValidationError):
            IntHitPointsState(maximum=12, current=-1)
        with pytest.raises(ValidationError):
            IntHitPointsState(maximum=-1, current=0)


class TestWeightedHitPoints:
    def test_round_trip(self):
        configuration = make_weighted_hit_points()
        assert HitPointsConfiguration.model_validate(configuration.model_dump()) == configuration

    def test_first_weight_must_be_one(self):
        with pytest.raises(ValidationError):
            WeightedHitPointsRules(starting_weight=0.9, scale=[
                ScaleStep(weight=0.9, label="High"), ScaleStep(weight=0.0, label="Zero")])

    def test_last_weight_must_be_zero(self):
        with pytest.raises(ValidationError):
            WeightedHitPointsRules(starting_weight=1.0, scale=[
                ScaleStep(weight=1.0, label="Full"), ScaleStep(weight=0.2, label="Low")])

    def test_non_descending_weights_rejected(self):
        with pytest.raises(ValidationError):
            WeightedHitPointsRules(starting_weight=1.0, scale=[
                ScaleStep(weight=1.0, label="Full"),
                ScaleStep(weight=0.5, label="Mid"),
                ScaleStep(weight=0.5, label="Also mid"),
                ScaleStep(weight=0.0, label="Zero")])

    def test_starting_weight_off_scale_rejected(self):
        with pytest.raises(ValidationError):
            WeightedHitPointsRules(starting_weight=0.4, scale=[
                ScaleStep(weight=1.0, label="Full"), ScaleStep(weight=0.0, label="Zero")])

    def test_fewer_than_two_steps_rejected(self):
        with pytest.raises(ValidationError):
            WeightedHitPointsRules(starting_weight=1.0, scale=[ScaleStep(weight=1.0, label="Full")])

    def test_scale_survives_json_round_trip_as_a_list(self):
        configuration = make_weighted_hit_points()
        revalidated = HitPointsConfiguration.model_validate_json(configuration.model_dump_json())
        assert isinstance(revalidated.rules.scale, list)
        assert [step.label for step in revalidated.rules.scale] == ["Full", "High", "Mid", "Low", "Zero"]

    def test_state_accepts_weight_not_on_any_scale(self):
        """Range-blind for the same reason as the int state."""
        assert WeightedHitPointsState(current_weight=0.45).current_weight == 0.45


class TestHitPointsDiscriminators:
    def test_int_rules_resolve_from_json(self):
        payload = {"type": "hit_points", "id": "hit_points_1", "label": "Vitality", "secret": False,
                   "rules": {"representation": "int", "minimum": 0, "maximum": 20}}
        configuration = HitPointsConfiguration.model_validate(payload)
        assert isinstance(configuration.rules, IntHitPointsRules)

    def test_weighted_rules_resolve_from_json(self):
        payload = {"type": "hit_points", "id": "hit_points_2", "label": "Resolve", "secret": True,
                   "rules": {"representation": "weighted", "starting_weight": 1.0,
                             "scale": [{"weight": 1.0, "label": "Full"}, {"weight": 0.0, "label": "Zero"}]}}
        configuration = HitPointsConfiguration.model_validate(payload)
        assert isinstance(configuration.rules, WeightedHitPointsRules)

    def test_states_resolve_from_json(self):
        int_value = HitPointsValue.model_validate({
            "type": "hit_points", "component_id": "hit_points_1",
            "state": {"representation": "int", "maximum": 12, "current": 3}})
        weighted_value = HitPointsValue.model_validate({
            "type": "hit_points", "component_id": "hit_points_2",
            "state": {"representation": "weighted", "current_weight": 0.6}})
        assert isinstance(int_value.state, IntHitPointsState)
        assert isinstance(weighted_value.state, WeightedHitPointsState)

    def test_rules_without_representation_rejected(self):
        with pytest.raises(ValidationError):
            HitPointsConfiguration.model_validate({
                "type": "hit_points", "id": "hit_points_1", "label": "Vitality",
                "rules": {"minimum": 0, "maximum": 20}})

    def test_unknown_representation_rejected(self):
        with pytest.raises(ValidationError):
            HitPointsConfiguration.model_validate({
                "type": "hit_points", "id": "hit_points_1", "label": "Vitality",
                "rules": {"representation": "percentage", "minimum": 0, "maximum": 20}})


class TestComponentDescription:
    """Every component may carry a GM-written description, shown on the form between the
    hint and the input. Optional everywhere, capped so it stays a sentence or two."""

    def test_defaults_to_none_on_every_type(self):
        assert make_identity().description is None
        assert make_int_hit_points().description is None
        assert make_attribute().description is None

    def test_round_trips(self):
        configuration = make_attribute(description="How strong you are.")
        assert AttributeConfiguration.model_validate(configuration.model_dump()).description == "How strong you are."

    def test_over_long_rejected(self):
        with pytest.raises(ValidationError):
            make_identity(description="x" * 241)


class TestAttributeComponent:
    def test_round_trip(self):
        configuration = make_attribute()
        assert AttributeConfiguration.model_validate(configuration.model_dump()) == configuration

    def test_minimum_not_below_maximum_rejected(self):
        with pytest.raises(ValidationError):
            make_attribute(minimum=20, maximum=20)

    def test_default_outside_range_rejected(self):
        with pytest.raises(ValidationError):
            make_attribute(minimum=1, maximum=20, default=21)

    def test_default_none_accepted(self):
        assert make_attribute(default=None).default is None

    def test_value_round_trip(self):
        value = AttributeValue(component_id="attribute_1", score=14)
        assert AttributeValue.model_validate(value.model_dump()) == value


class TestCharacterConfig:
    def test_empty_components_accepted(self):
        """A campaign that has published nothing is a legal config, not an error."""
        assert CharacterConfig(version=1).components == []

    def test_three_hit_points_components_accepted(self):
        """Cardinality is the GM's call. The contract never says how many of a type."""
        config = CharacterConfig(version=1, components=[
            make_int_hit_points("hit_points_1", "Body"),
            make_int_hit_points("hit_points_2", "Mind"),
            make_weighted_hit_points("hit_points_3", "Spirit"),
        ])
        assert len(config.components) == 3

    def test_duplicate_component_ids_rejected(self):
        with pytest.raises(ValidationError):
            CharacterConfig(version=1, components=[make_identity("identity_1"), make_identity("identity_1", label="Other")])

    def test_version_below_one_rejected(self):
        with pytest.raises(ValidationError):
            CharacterConfig(version=0)

    def test_configuration_by_id_returns_every_component(self):
        config = make_mock_config()
        by_id = config.configuration_by_id()
        assert set(by_id) == {"identity_1", "hit_points_1", "hit_points_2",
                              "attribute_1", "attribute_2", "attribute_3"}

    def test_mock_config_json_round_trip(self):
        config = make_mock_config()
        assert CharacterConfig.model_validate_json(config.model_dump_json()) == config

    def test_unknown_component_type_rejected(self):
        with pytest.raises(ValidationError):
            CharacterConfig.model_validate({"version": 1, "components": [
                {"type": "alignment", "id": "alignment_1", "label": "Alignment"}]})


class TestComponentGroups:
    """A group is a GM-named section of the form holding an ordered run of components.
    One level deep, an entry in the same top-level list as bare components, and part of
    the versioned config — a player builds against the sections too."""

    def make_grouped(self):
        return CharacterConfig(version=1, components=[
            make_identity(),
            ComponentGroup(id="group_1", label="Combat", components=[
                make_int_hit_points(),
                make_attribute("attribute_1", "Strength"),
            ]),
            make_attribute("attribute_2", "Agility"),
        ])

    def test_round_trips_through_json(self):
        config = self.make_grouped()
        assert CharacterConfig.model_validate_json(config.model_dump_json()) == config

    def test_flat_components_keeps_order_and_ignores_the_group_boundary(self):
        assert [c.id for c in self.make_grouped().flat_components()] == [
            "identity_1", "hit_points_1", "attribute_1", "attribute_2"]

    def test_configuration_by_id_reaches_inside_groups(self):
        assert self.make_grouped().configuration_by_id()["hit_points_1"].label == "Vitality"

    def test_groups_do_not_nest(self):
        with pytest.raises(ValidationError):
            CharacterConfig.model_validate({"version": 1, "components": [
                {"type": "group", "id": "group_1", "label": "Outer", "components": [
                    {"type": "group", "id": "group_2", "label": "Inner", "components": []}]}]})

    def test_ids_are_unique_across_groups_and_components(self):
        with pytest.raises(ValidationError):
            CharacterConfig(version=1, components=[
                make_identity("identity_1"),
                ComponentGroup(id="group_1", label="A", components=[make_identity("identity_1", label="Again")]),
            ])
        with pytest.raises(ValidationError):
            CharacterConfig(version=1, components=[
                ComponentGroup(id="same", label="A"),
                make_identity("same"),
            ])

    def test_an_empty_group_is_legal(self):
        """A GM adds the section before dragging anything in."""
        config = CharacterConfig(version=1, components=[ComponentGroup(id="group_1", label="Later")])
        assert config.flat_components() == []

    def test_sheet_pairs_against_grouped_config(self):
        values = {"hit_points_1": HitPointsValue(component_id="hit_points_1", state=IntHitPointsState(maximum=12, current=3))}
        assert CharacterSheet(config=self.make_grouped(), values=values).values["hit_points_1"].state.current == 3

    def test_old_snapshots_without_groups_still_validate(self):
        """A list of bare components is a list of entries — every existing version is fine."""
        assert make_mock_config().flat_components() == make_mock_config().components


class TestDiffConfigsWithGroups:
    def test_moving_into_a_group_is_a_position_change(self):
        older = CharacterConfig(version=1, components=[make_identity(), make_int_hit_points()])
        newer = CharacterConfig(version=2, components=[
            make_identity(), ComponentGroup(id="group_1", label="Combat", components=[make_int_hit_points()])])
        changes = diff_configs(older, newer)
        assert [(c.component_id, c.kind, c.fields) for c in changes] == [
            ("hit_points_1", "changed", ["position"]),
            ("group_1", "added", []),
        ]

    def test_renaming_a_group_is_a_change_on_the_group(self):
        older = CharacterConfig(version=1, components=[
            ComponentGroup(id="group_1", label="Combat", components=[make_int_hit_points()])])
        newer = CharacterConfig(version=2, components=[
            ComponentGroup(id="group_1", label="Fighting", components=[make_int_hit_points()])])
        changes = diff_configs(older, newer)
        assert [(c.component_id, c.kind, c.fields, c.label) for c in changes] == [
            ("group_1", "changed", ["label"], "Fighting")]

    def test_ungrouping_moves_the_members_and_removes_the_group(self):
        older = CharacterConfig(version=1, components=[
            make_identity(), ComponentGroup(id="group_1", label="Combat", components=[make_int_hit_points()])])
        newer = CharacterConfig(version=2, components=[make_identity(), make_int_hit_points()])
        changes = diff_configs(older, newer)
        assert [(c.component_id, c.kind) for c in changes] == [
            ("group_1", "removed"), ("hit_points_1", "changed")]
        assert changes[1].fields == ["position"]

    def test_reordering_inside_a_group_is_a_position_change(self):
        older = CharacterConfig(version=1, components=[ComponentGroup(id="group_1", label="G", components=[
            make_attribute("attribute_1", "A"), make_attribute("attribute_2", "B")])])
        newer = CharacterConfig(version=2, components=[ComponentGroup(id="group_1", label="G", components=[
            make_attribute("attribute_2", "B"), make_attribute("attribute_1", "A")])])
        changes = diff_configs(older, newer)
        assert len(changes) == 1 and changes[0].fields == ["position"]


class TestCharacterSheet:
    def test_mock_config_and_values_validate(self):
        sheet = CharacterSheet(config=make_mock_config(), values=make_mock_values())
        assert len(sheet.values) == 6

    def test_values_key_must_match_component_id(self):
        values = make_mock_values()
        values["wrong_key"] = values.pop("identity_1")
        with pytest.raises(ValidationError):
            CharacterSheet(config=make_mock_config(), values=values)

    def test_unknown_component_id_rejected(self):
        values = make_mock_values()
        values["attribute_9"] = AttributeValue(component_id="attribute_9", score=10)
        with pytest.raises(ValidationError):
            CharacterSheet(config=make_mock_config(), values=values)

    def test_type_mismatch_rejected(self):
        """An identity value against a hit-points configuration is a data invariant: hard block."""
        values = make_mock_values()
        values["hit_points_1"] = make_text_answer("hit_points_1", "nope")
        with pytest.raises(ValidationError):
            CharacterSheet(config=make_mock_config(), values=values)

    def test_representation_mismatch_rejected(self):
        values = make_mock_values()
        values["hit_points_1"] = HitPointsValue(
            component_id="hit_points_1", state=WeightedHitPointsState(current_weight=1.0))
        with pytest.raises(ValidationError):
            CharacterSheet(config=make_mock_config(), values=values)

    def test_text_longer_than_configured_max_rejected(self):
        config = CharacterConfig(version=1, components=[make_identity(max_length=5)])
        with pytest.raises(ValidationError):
            CharacterSheet(config=config, values={"identity_1": make_text_answer("identity_1", "far too long")})

    def test_identity_kind_mismatch_rejected(self):
        """A text answer to a select identity is a data invariant: hard block."""
        config = CharacterConfig(version=1, components=[
            make_identity(input=SingleSelectIdentityInput(options=["Rogue", "Mage"]))])
        with pytest.raises(ValidationError):
            CharacterSheet(config=config, values={"identity_1": make_text_answer("identity_1", "Rogue")})

    def test_choice_no_longer_among_options_accepted(self):
        """Axis 2: the GM rewrote the list after the character picked. Reported, never blocked."""
        config = CharacterConfig(version=1, components=[
            make_identity(input=SingleSelectIdentityInput(options=["Rogue", "Mage"]))])
        value = IdentityValue(component_id="identity_1", answer=SingleSelectIdentityAnswer(choice="Bard"))
        assert CharacterSheet(config=config, values={"identity_1": value}).values["identity_1"].answer.choice == "Bard"

    def test_attribute_above_configured_maximum_accepted(self):
        """Axis 2: a GM raised or lowered the range after the character was built. That is a
        version difference the GM is shown, never a block."""
        values = make_mock_values()
        values["attribute_1"] = AttributeValue(component_id="attribute_1", score=99)
        assert CharacterSheet(config=make_mock_config(), values=values).values["attribute_1"].score == 99

    def test_hit_points_maximum_above_entry_bound_accepted(self):
        """Axis 2, same reasoning as the attribute above: the GM lowered the bound after the
        character entered its maximum."""
        values = make_mock_values()
        values["hit_points_1"] = HitPointsValue(
            component_id="hit_points_1", state=IntHitPointsState(maximum=500, current=500))
        assert CharacterSheet(config=make_mock_config(), values=values).values["hit_points_1"].state.maximum == 500

    def test_weight_no_longer_on_the_scale_accepted(self):
        """Axis 2: the GM edited the scale under a character that had picked a step."""
        values = make_mock_values()
        values["hit_points_2"] = HitPointsValue(
            component_id="hit_points_2", state=WeightedHitPointsState(current_weight=0.45))
        assert CharacterSheet(config=make_mock_config(), values=values).values["hit_points_2"].state.current_weight == 0.45

    def test_missing_value_for_configured_component_accepted(self):
        """Absence is not an error: a secret value stripped for this viewer, or a draft."""
        values = make_mock_values()
        del values["attribute_3"]
        assert "attribute_3" not in CharacterSheet(config=make_mock_config(), values=values).values

    def test_empty_values_accepted(self):
        assert CharacterSheet(config=make_mock_config()).values == {}


class TestDiffConfigs:
    def test_identical_configs_report_nothing(self):
        assert diff_configs(make_mock_config(), make_mock_config()) == []

    def test_mock_v1_to_v2(self):
        """Vitality maximum 20->25, Wits removed, Nerve added — in the documented order."""
        older = make_mock_config()
        newer = CharacterConfig(version=2, components=[
            make_identity(),
            make_int_hit_points(rules=IntHitPointsRules(minimum=0, maximum=25)),
            make_weighted_hit_points(),
            make_attribute("attribute_1", "Strength"),
            make_attribute("attribute_2", "Agility"),
            make_attribute("attribute_4", "Nerve"),
        ])
        changes = diff_configs(older, newer)
        assert [(change.component_id, change.kind) for change in changes] == [
            ("attribute_3", "removed"),
            ("hit_points_1", "changed"),
            ("attribute_4", "added"),
        ]
        assert changes[1].fields == ["rules.maximum"]
        assert changes[0].label == "Wits"
        assert changes[2].label == "Nerve"

    def test_label_only_change(self):
        older = CharacterConfig(version=1, components=[make_attribute(label="Strength")])
        newer = CharacterConfig(version=2, components=[make_attribute(label="Might")])
        changes = diff_configs(older, newer)
        assert len(changes) == 1
        assert changes[0].fields == ["label"]

    def test_weighted_scale_change_reports_one_path(self):
        older = CharacterConfig(version=1, components=[make_weighted_hit_points()])
        newer = CharacterConfig(version=2, components=[make_weighted_hit_points(
            rules=WeightedHitPointsRules(starting_weight=1.0, scale=[
                ScaleStep(weight=1.0, label="Full"),
                ScaleStep(weight=0.5, label="Half"),
                ScaleStep(weight=0.0, label="Zero")]))])
        changes = diff_configs(older, newer)
        assert changes[0].fields == ["rules.scale"]

    def test_a_pure_reorder_is_a_change(self):
        """The form renders components in the GM's order, so order is part of the config
        and a reorder must be publishable. Moving Wits to the front is one move."""
        older = make_mock_config()
        components = list(older.components)
        wits = components.pop(5)
        newer = CharacterConfig(version=2, components=[wits] + components)
        changes = diff_configs(older, newer)
        assert [(change.component_id, change.kind, change.fields) for change in changes] == [
            ("attribute_3", "changed", ["position"]),
        ]

    def test_reorder_reports_the_minimal_moves(self):
        """Moving one component shifts every other one's index; only the one that moved
        is reported, or a single drag would read as the whole config changing."""
        older = make_mock_config()
        components = list(older.components)
        name = components.pop(0)
        newer = CharacterConfig(version=2, components=components + [name])
        changes = diff_configs(older, newer)
        assert len(changes) == 1
        assert changes[0].component_id == "identity_1"
        assert changes[0].fields == ["position"]

    def test_moved_and_edited_is_one_entry(self):
        older = make_mock_config()
        components = list(older.components)
        wits = components.pop(5)
        newer = CharacterConfig(version=2, components=[
            make_attribute("attribute_3", "Cunning")] + components)
        changes = diff_configs(older, newer)
        assert len(changes) == 1
        assert changes[0].kind == "changed"
        assert changes[0].fields == ["label", "position"]

    def test_description_change_is_a_field(self):
        older = CharacterConfig(version=1, components=[make_attribute()])
        newer = CharacterConfig(version=2, components=[make_attribute(description="How strong you are.")])
        assert diff_configs(older, newer)[0].fields == ["description"]

    def test_change_is_information_not_a_verdict(self):
        """diff_configs returns descriptions. Nothing in the contract ranks or blocks them."""
        change = ComponentChange(component_id="x", kind="changed", label="X", fields=["label"])
        assert set(change.model_dump()) == {"component_id", "kind", "label", "fields"}
