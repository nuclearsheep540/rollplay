# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The character aggregate after the system-agnostic rewrite.

The aggregate knows what a component *is* — it can pair a value with a configuration and
read a Name — and nothing about what any component *means*. There is no damage, no death,
no level. Its one derived fact is the display name.
"""

import uuid

import pytest
from pydantic import ValidationError
from shared_contracts.character_config import CharacterConfig
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

from modules.characters.domain.character_aggregate import UNNAMED, CharacterAggregate


def make_config(*, names=(("identity_1", "Name", True),), attributes=(("attribute_1", "Strength"),)):
    components = [
        IdentityConfiguration(id=component_id, label=label, input=TextIdentityInput(), required=required)
        for component_id, label, required in names
    ]
    components.append(HitPointsConfiguration(
        id="hit_points_1", label="Vitality",
        rules=IntHitPointsRules(minimum=0, maximum=20)))
    components.extend(
        AttributeConfiguration(id=component_id, label=label, minimum=1, maximum=20, default=10)
        for component_id, label in attributes
    )
    return CharacterConfig(version=1, components=components)


def make_values(name_texts=("Brannoc Vell",), score=14):
    values = {}
    for index, text in enumerate(name_texts, start=1):
        values[f"identity_{index}"] = IdentityValue(component_id=f"identity_{index}", answer=TextIdentityAnswer(text=text))
    values["hit_points_1"] = HitPointsValue(
        component_id="hit_points_1", state=IntHitPointsState(maximum=20, current=10))
    values["attribute_1"] = AttributeValue(component_id="attribute_1", score=score)
    return values


def make_character(config=None, values=None, **overrides):
    fields = {
        "user_id": uuid.uuid4(),
        "campaign_id": uuid.uuid4(),
        "session_id": uuid.uuid4(),
        "config_version_id": uuid.uuid4(),
        "config": config or make_config(),
        "values": values if values is not None else make_values(),
        "slot": 0,
    }
    fields.update(overrides)
    return CharacterAggregate.create(**fields)


class TestCreate:
    def test_pairs_and_derives_the_display_name(self):
        character = make_character()
        assert character.display_name == "Brannoc Vell"
        assert character.is_alive is True

    def test_two_name_components_join_with_a_space(self):
        config = make_config(names=(("identity_1", "First name", True), ("identity_2", "Family name", False)))
        character = make_character(config=config, values=make_values(("Brannoc", "Vell")))
        assert character.display_name == "Brannoc Vell"

    def test_no_name_components_falls_back(self):
        config = CharacterConfig(version=1, components=[
            AttributeConfiguration(id="attribute_1", label="Strength", minimum=1, maximum=20)])
        character = make_character(
            config=config,
            values={"attribute_1": AttributeValue(component_id="attribute_1", score=10)})
        assert character.display_name == UNNAMED

    def test_missing_required_name_is_refused_by_label(self):
        with pytest.raises(ValueError, match="Missing required: Name"):
            make_character(values={"hit_points_1": HitPointsValue(
                component_id="hit_points_1", state=IntHitPointsState(maximum=20, current=10))})

    def test_blank_required_name_is_refused(self):
        values = make_values()
        values["identity_1"] = IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="   "))
        with pytest.raises(ValueError, match="Missing required"):
            make_character(values=values)

    def test_optional_name_may_be_absent(self):
        config = make_config(names=(("identity_1", "First name", True), ("identity_2", "Nickname", False)))
        character = make_character(config=config, values=make_values(("Brannoc",)))
        assert character.display_name == "Brannoc"

    def test_type_mismatch_is_a_hard_block(self):
        values = make_values()
        values["hit_points_1"] = IdentityValue(component_id="hit_points_1", answer=TextIdentityAnswer(text="nope"))
        with pytest.raises(ValidationError):
            make_character(values=values)

    def test_select_identities_are_not_part_of_the_display_name(self):
        """A class or a set of roles is an identity, not a name."""
        config = CharacterConfig(version=1, components=[
            IdentityConfiguration(id="identity_1", label="Name", input=TextIdentityInput()),
            IdentityConfiguration(id="identity_2", label="Class",
                                  input=SingleSelectIdentityInput(options=["Rogue", "Mage"])),
            IdentityConfiguration(id="identity_3", label="Roles", required=False,
                                  input=MultiSelectIdentityInput(options=["Guard", "Cook"])),
        ])
        values = {
            "identity_1": IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="Brannoc")),
            "identity_2": IdentityValue(component_id="identity_2", answer=SingleSelectIdentityAnswer(choice="Rogue")),
            "identity_3": IdentityValue(component_id="identity_3", answer=MultiSelectIdentityAnswer(choices=["Guard", "Cook"])),
        }
        assert make_character(config=config, values=values).display_name == "Brannoc"

    def test_required_multi_select_with_no_choice_is_refused(self):
        config = CharacterConfig(version=1, components=[
            IdentityConfiguration(id="identity_1", label="Roles",
                                  input=MultiSelectIdentityInput(options=["Guard", "Cook"])),
        ])
        values = {"identity_1": IdentityValue(component_id="identity_1", answer=MultiSelectIdentityAnswer(choices=[]))}
        with pytest.raises(ValueError, match="Missing required: Roles"):
            make_character(config=config, values=values)

    def test_values_are_copied_not_aliased(self):
        """The caller's dict must not become the aggregate's state."""
        values = make_values()
        character = make_character(values=values)
        values["attribute_1"] = AttributeValue(component_id="attribute_1", score=1)
        assert character.values["attribute_1"].score == 14


class TestSetComponentValue:
    def test_replaces_one_value_and_redirves_the_name(self):
        character = make_character()
        character.set_component_value(IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="Someone Else")))
        assert character.display_name == "Someone Else"
        assert character.values["attribute_1"].score == 14

    def test_mismatched_representation_raises(self):
        character = make_character()
        with pytest.raises(ValidationError):
            character.set_component_value(HitPointsValue(
                component_id="hit_points_1", state=WeightedHitPointsState(current_weight=1.0)))

    def test_unknown_component_raises(self):
        character = make_character()
        with pytest.raises(ValidationError):
            character.set_component_value(AttributeValue(component_id="attribute_9", score=3))

    def test_out_of_range_score_is_accepted(self):
        """Axis 2: the GM narrowed the range after this character was built. Information,
        not a gate — the aggregate must not be the thing that blocks it."""
        character = make_character()
        character.set_component_value(AttributeValue(component_id="attribute_1", score=99))
        assert character.values["attribute_1"].score == 99

    def test_zero_hit_points_is_just_a_value(self):
        """Reaching the zero point renders as empty and does nothing else. No auto-death."""
        character = make_character()
        character.set_component_value(HitPointsValue(
            component_id="hit_points_1", state=IntHitPointsState(maximum=20, current=0)))
        assert character.is_alive is True


class TestReplaceValues:
    def test_whole_document_replace_rederives(self):
        character = make_character()
        character.replace_values(make_values(("New Name",), score=3))
        assert character.display_name == "New Name"
        assert character.values["attribute_1"].score == 3

    def test_pairing_still_applies(self):
        character = make_character()
        with pytest.raises(ValidationError):
            character.replace_values({"attribute_9": AttributeValue(component_id="attribute_9", score=1)})


class TestTableMembership:
    def test_a_new_character_is_not_a_keepsake(self):
        assert make_character().is_keepsake is False

    def test_unbind_makes_a_keepsake_and_keeps_everything_else(self):
        character = make_character()
        character.unbind_from_table()
        assert character.is_keepsake is True
        assert character.session_id is None
        assert character.campaign_id is None
        assert character.config_version_id is None
        assert character.display_name == "Brannoc Vell"
        assert character.values["attribute_1"].score == 14
        assert len(character.config_snapshot.components) == 3

    def test_a_dead_character_is_still_at_its_table(self):
        """Aliveness and membership are different facts; only ejecting removes a character."""
        character = make_character()
        character.set_alive(False)
        assert character.is_alive is False
        assert character.session_id is not None
        assert character.is_keepsake is False


class TestWeightedRepresentation:
    def test_weighted_hit_points_pair_and_store(self):
        config = CharacterConfig(version=1, components=[
            IdentityConfiguration(id="identity_1", label="Name", input=TextIdentityInput()),
            HitPointsConfiguration(id="hit_points_1", label="Resolve", rules=WeightedHitPointsRules(
                starting_weight=1.0,
                scale=[ScaleStep(weight=1.0, label="Full"),
                       ScaleStep(weight=0.6, label="Mid"),
                       ScaleStep(weight=0.0, label="Zero")])),
        ])
        character = make_character(config=config, values={
            "identity_1": IdentityValue(component_id="identity_1", answer=TextIdentityAnswer(text="Brannoc")),
            "hit_points_1": HitPointsValue(
                component_id="hit_points_1", state=WeightedHitPointsState(current_weight=1.0)),
        })
        character.set_component_value(HitPointsValue(
            component_id="hit_points_1", state=WeightedHitPointsState(current_weight=0.6)))
        assert character.values["hit_points_1"].state.current_weight == 0.6
