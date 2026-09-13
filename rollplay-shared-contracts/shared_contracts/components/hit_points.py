# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Hit points component — an ordered scale with a current position and a zero point.

Two representations share that meaning:
  int      — a number between minimum and maximum; minimum is the zero point.
  weighted — a list of labelled steps from weight 1.0 (best) to 0.0 (zero point).

The runtime renders both as a bar and a label and never decides what reaching zero means.
"""

from typing import Annotated, List, Literal, Union

from pydantic import Field, model_validator

from ..base import ContractModel


class IntHitPointsRules(ContractModel):
    representation: Literal["int"] = "int"
    minimum: int = 0
    maximum: int = Field(ge=1)
    starting: int

    @model_validator(mode="after")
    def check_bounds(self) -> "IntHitPointsRules":
        if self.minimum >= self.maximum:
            raise ValueError("minimum must be less than maximum")
        if not (self.minimum <= self.starting <= self.maximum):
            raise ValueError("starting must lie between minimum and maximum")
        return self


class ScaleStep(ContractModel):
    weight: float = Field(ge=0.0, le=1.0)
    label: str = Field(min_length=1, max_length=40)


class WeightedHitPointsRules(ContractModel):
    representation: Literal["weighted"] = "weighted"
    scale: List[ScaleStep] = Field(min_length=2)
    starting_weight: float

    @model_validator(mode="after")
    def check_scale(self) -> "WeightedHitPointsRules":
        weights = [step.weight for step in self.scale]
        if weights[0] != 1.0:
            raise ValueError("the first step must have weight 1.0")
        if weights[-1] != 0.0:
            raise ValueError("the last step must have weight 0.0")
        for earlier, later in zip(weights, weights[1:]):
            if later >= earlier:
                raise ValueError("step weights must strictly descend")
        if self.starting_weight not in weights:
            raise ValueError("starting_weight must be the weight of one step")
        return self


HitPointsRules = Annotated[
    Union[IntHitPointsRules, WeightedHitPointsRules],
    Field(discriminator="representation"),
]


class HitPointsConfiguration(ContractModel):
    type: Literal["hit_points"] = "hit_points"
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=60)
    secret: bool = False
    rules: HitPointsRules


class IntHitPointsState(ContractModel):
    representation: Literal["int"] = "int"
    current: int


class WeightedHitPointsState(ContractModel):
    representation: Literal["weighted"] = "weighted"
    current_weight: float = Field(ge=0.0, le=1.0)


HitPointsState = Annotated[
    Union[IntHitPointsState, WeightedHitPointsState],
    Field(discriminator="representation"),
]


class HitPointsValue(ContractModel):
    type: Literal["hit_points"] = "hit_points"
    component_id: str = Field(min_length=1, max_length=64)
    # Deliberately NOT validated against the rules' range or scale: a value that no longer
    # fits its configuration is a version difference the GM is shown (diff_configs), never
    # a data invariant. Pairing that IS an invariant — type and representation — is checked
    # in CharacterSheet, which can see both sides.
    state: HitPointsState
