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
from shared_contracts.image import ImageConfig
from shared_contracts.map import FOG_REGIONS_MAX, FogConfig, FogRegion, GridColorMode, GridConfig, MapConfig
from shared_contracts.session import (
    PlayerState,
    SessionEndFinalState,
    SessionEndResponse,
    SessionStartPayload,
    SessionStartResponse,
    SessionStats,
)


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
        )
        assert MapConfig.model_validate(config.model_dump()) == config

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
        assert region.paint_mode_opacity == 0.7

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
            paint_mode_opacity=0.5,
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
            FogRegion(id="r1", paint_mode_opacity=1.5)

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


class TestSessionRoundTrip:
    def test_session_start_payload_round_trip(self):
        payload = SessionStartPayload(
            session_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
            max_players=6,
            joined_user_ids=["u1", "u2"],
            session_users=[
                SessionUser(
                    user_id="u1",
                    player_name="alice",
                    campaign_role="player",
                    character=PlayerCharacter(
                        user_id="u1",
                        player_name="alice",
                        campaign_role="player",
                        character_id="char-1",
                        character_name="Aelwyn",
                        character_class=["Wizard"],
                        character_race="Elf",
                        level=5,
                        hp_current=22,
                        hp_max=28,
                        ac=14,
                    ),
                ),
                SessionUser(
                    user_id="u2",
                    player_name="bob",
                    campaign_role="spectator",
                ),
            ],
            assets=[AssetRef(id="a1", filename="map.png", s3_key="maps/map.png", asset_type="map")],
            audio_config={"channel_0": AudioChannelState(filename="bgm.mp3", volume=0.7)},
            map_config=MapConfig(asset_id="m1", filename="dungeon.png", file_path="https://s3.example.com/dungeon.png"),
            active_display=ActiveDisplayType.MAP,
        )
        assert SessionStartPayload.model_validate(payload.model_dump()) == payload

    def test_session_start_payload_minimal_round_trip(self):
        payload = SessionStartPayload(
            session_id="s1",
            campaign_id="c1",
            dungeon_master=DungeonMaster(user_id="u-dm", player_name="dm_user"),
        )
        assert SessionStartPayload.model_validate(payload.model_dump()) == payload

    def test_session_end_final_state_round_trip(self):
        state = SessionEndFinalState(
            players=[PlayerState(user_id="u1", player_name="Alice", seat_position=0, seat_color="#FF6B6B")],
            session_stats=SessionStats(duration_minutes=120, total_logs=47, max_players=5),
            audio_state={"channel_0": AudioChannelState(volume=0.5, playback_state="paused")},
            map_state=MapConfig(asset_id="m1", filename="map.png", file_path="https://s3.example.com/map.png"),
            active_display=ActiveDisplayType.IMAGE,
        )
        assert SessionEndFinalState.model_validate(state.model_dump()) == state

    def test_session_end_response_round_trip(self):
        response = SessionEndResponse(
            success=True,
            final_state=SessionEndFinalState(),
            message="Session ended",
        )
        assert SessionEndResponse.model_validate(response.model_dump()) == response

    def test_session_start_response_round_trip(self):
        response = SessionStartResponse(success=True, session_id="s1", message="Started")
        assert SessionStartResponse.model_validate(response.model_dump()) == response


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


class TestSessionShapeConformance:
    def test_session_start_payload_has_required_fields(self):
        required_keys = {
            "session_id", "campaign_id", "dungeon_master", "max_players",
            "joined_user_ids", "session_users", "assets", "audio_config", "audio_track_config",
            "map_config", "image_config", "active_display",
        }
        assert required_keys.issubset(set(SessionStartPayload.model_fields.keys()))


class TestCharacterShapeConformance:
    def test_player_character_has_required_fields(self):
        required_keys = {
            "user_id", "player_name", "campaign_role", "character_id",
            "character_name", "character_class", "character_race", "level",
            "hp_current", "hp_max", "ac",
        }
        assert required_keys.issubset(set(PlayerCharacter.model_fields.keys()))

    def test_session_end_final_state_has_required_fields(self):
        required_keys = {
            "players", "session_stats", "audio_state", "audio_track_config",
            "map_state", "image_state", "active_display",
        }
        assert required_keys.issubset(set(SessionEndFinalState.model_fields.keys()))


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
