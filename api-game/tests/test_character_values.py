# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""api-game's only knowledge of components: pairing and visibility.

Secret means "only the player and the GM can see these values", and this is where that is
true. Every test builds its own room — nothing here is shared.
"""

import pytest
from shared_contracts.components.attribute import AttributeValue
from shared_contracts.components.hit_points import (
    HitPointsValue,
    IntHitPointsState,
    WeightedHitPointsState,
)
from shared_contracts.components.identity import IdentityValue, TextIdentityAnswer

from character_values import (
    config_for_player,
    filter_component_change_for_viewer,
    filter_values_for_viewer,
    render_value_for_log,
    secret_component_ids,
    validate_value_for_player,
)

GM_ID = "gm-1"
OWNER_ID = "player-1"
OTHER_ID = "player-2"


def make_config(secret_resolve=True):
    """The design mock's config, as the room stores it. Fresh dict per call."""
    return {
        "version": 1,
        "components": [
            {"type": "identity", "id": "identity_1", "label": "Name", "secret": False,
             "input": {"kind": "text", "max_length": 60}, "required": True},
            {"type": "hit_points", "id": "hit_points_1", "label": "Vitality", "secret": False,
             "rules": {"representation": "int", "minimum": 0, "maximum": 20}},
            {"type": "hit_points", "id": "hit_points_2", "label": "Resolve",
             "secret": secret_resolve,
             "rules": {"representation": "weighted", "starting_weight": 1.0, "scale": [
                 {"weight": 1.0, "label": "Full"}, {"weight": 0.6, "label": "Mid"},
                 {"weight": 0.0, "label": "Zero"}]}},
            {"type": "attribute", "id": "attribute_1", "label": "Strength", "secret": False,
             "minimum": 1, "maximum": 20, "default": 10},
        ],
    }


def make_room(secret_resolve=True):
    return {
        "dungeon_master": {"user_id": GM_ID, "player_name": "Matt"},
        "character_configs": {"ver-1": make_config(secret_resolve)},
        "player_metadata": {
            GM_ID: {"user_id": GM_ID, "player_name": "Matt"},
            OWNER_ID: {
                "user_id": OWNER_ID, "player_name": "Bran", "character_id": "char-1",
                "display_name": "Brannoc Vell", "config_version_id": "ver-1",
                "values": {
                    "identity_1": {"type": "identity", "component_id": "identity_1", "answer": {"kind": "text", "text": "Brannoc Vell"}},
                    "hit_points_1": {"type": "hit_points", "component_id": "hit_points_1",
                                     "state": {"representation": "int", "current": 10}},
                    "hit_points_2": {"type": "hit_points", "component_id": "hit_points_2",
                                     "state": {"representation": "weighted", "current_weight": 1.0}},
                    "attribute_1": {"type": "attribute", "component_id": "attribute_1", "score": 14},
                },
            },
            OTHER_ID: {"user_id": OTHER_ID, "player_name": "Someone"},
        },
    }


class TestConfigForPlayer:
    def test_resolves_the_players_own_version(self):
        assert config_for_player(make_room(), OWNER_ID).version == 1

    def test_none_for_a_player_with_no_character(self):
        assert config_for_player(make_room(), GM_ID) is None

    def test_none_for_an_unknown_user(self):
        assert config_for_player(make_room(), "nobody") is None

    def test_none_when_the_room_lost_the_version(self):
        """Cannot validate is not the same as anything goes."""
        room = make_room()
        room["character_configs"] = {}
        assert config_for_player(room, OWNER_ID) is None


class TestValidateValueForPlayer:
    def test_a_matching_value_passes(self):
        validate_value_for_player(make_room(), OWNER_ID, HitPointsValue(
            component_id="hit_points_1", state=IntHitPointsState(maximum=20, current=3)))

    def test_unknown_component_rejected(self):
        with pytest.raises(ValueError):
            validate_value_for_player(make_room(), OWNER_ID, AttributeValue(
                component_id="attribute_9", score=3))

    def test_type_mismatch_rejected(self):
        with pytest.raises(ValueError):
            validate_value_for_player(make_room(), OWNER_ID, IdentityValue(
                component_id="hit_points_1", answer=TextIdentityAnswer(text="nope")))

    def test_representation_mismatch_rejected(self):
        with pytest.raises(ValueError):
            validate_value_for_player(make_room(), OWNER_ID, HitPointsValue(
                component_id="hit_points_1", state=WeightedHitPointsState(current_weight=0.6)))

    def test_a_player_with_no_config_is_rejected(self):
        with pytest.raises(ValueError, match="no character config"):
            validate_value_for_player(make_room(), GM_ID, AttributeValue(
                component_id="attribute_1", score=3))

    def test_out_of_range_is_allowed(self):
        """Axis 2: the GM narrowed the range after this character was built. Information,
        never a gate — api-game is the last place that should be enforcing a rule."""
        validate_value_for_player(make_room(), OWNER_ID, AttributeValue(
            component_id="attribute_1", score=999))


class TestSecretFiltering:
    def test_the_owner_sees_their_own_secret(self):
        visible = filter_values_for_viewer(make_room(), OWNER_ID)
        assert "hit_points_2" in visible[OWNER_ID]["values"]

    def test_the_gm_sees_everything(self):
        visible = filter_values_for_viewer(make_room(), GM_ID)
        assert "hit_points_2" in visible[OWNER_ID]["values"]

    def test_a_third_player_does_not(self):
        visible = filter_values_for_viewer(make_room(), OTHER_ID)
        assert "hit_points_2" not in visible[OWNER_ID]["values"]
        # …but the non-secret ones still reach them.
        assert visible[OWNER_ID]["values"]["hit_points_1"]["state"]["current"] == 10

    def test_an_unknown_viewer_sees_no_secrets(self):
        """Failing closed is the only safe direction here."""
        visible = filter_values_for_viewer(make_room(), None)
        assert "hit_points_2" not in visible[OWNER_ID]["values"]

    def test_nothing_is_hidden_when_nothing_is_secret(self):
        visible = filter_values_for_viewer(make_room(secret_resolve=False), OTHER_ID)
        assert "hit_points_2" in visible[OWNER_ID]["values"]

    def test_the_room_is_never_mutated(self):
        """This runs once per socket; a mutation would leak one viewer's filtering into
        the next viewer's send."""
        room = make_room()
        filter_values_for_viewer(room, OTHER_ID)
        assert "hit_points_2" in room["player_metadata"][OWNER_ID]["values"]

    def test_secret_component_ids_reads_the_flag(self):
        from shared_contracts.character_config import CharacterConfig
        assert secret_component_ids(CharacterConfig.model_validate(make_config())) == {"hit_points_2"}


class TestChangeVisibility:
    def test_owner_and_gm_are_told_about_a_secret_change(self):
        room = make_room()
        assert filter_component_change_for_viewer(room, OWNER_ID, "hit_points_2", OWNER_ID)
        assert filter_component_change_for_viewer(room, OWNER_ID, "hit_points_2", GM_ID)

    def test_a_third_player_is_not(self):
        assert not filter_component_change_for_viewer(make_room(), OWNER_ID, "hit_points_2", OTHER_ID)

    def test_everyone_hears_about_a_public_change(self):
        assert filter_component_change_for_viewer(make_room(), OWNER_ID, "hit_points_1", OTHER_ID)


class TestLogRendering:
    def _configuration(self, component_id):
        from shared_contracts.character_config import CharacterConfig
        return CharacterConfig.model_validate(make_config()).configuration_by_id()[component_id]

    def test_int_hit_points_render_as_the_number(self):
        assert render_value_for_log(
            self._configuration("hit_points_1"),
            HitPointsValue(component_id="hit_points_1", state=IntHitPointsState(maximum=20, current=7))) == "7"

    def test_weighted_hit_points_render_as_the_step_label(self):
        assert render_value_for_log(
            self._configuration("hit_points_2"),
            HitPointsValue(component_id="hit_points_2",
                           state=WeightedHitPointsState(current_weight=0.6))) == "Mid"

    def test_an_off_scale_weight_shows_the_weight(self):
        """The GM edited the scale under a character that had picked a step: show the raw
        weight rather than inventing a label for it."""
        assert render_value_for_log(
            self._configuration("hit_points_2"),
            HitPointsValue(component_id="hit_points_2",
                           state=WeightedHitPointsState(current_weight=0.45))) == "0.45"

    def test_attribute_renders_as_the_score(self):
        assert render_value_for_log(
            self._configuration("attribute_1"),
            AttributeValue(component_id="attribute_1", score=14)) == "14"

    def test_name_renders_as_the_text(self):
        assert render_value_for_log(
            self._configuration("identity_1"),
            IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="Brannoc Vell"))) == "Brannoc Vell"
