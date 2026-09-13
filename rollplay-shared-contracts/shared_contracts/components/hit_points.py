# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Hit points component — an ordered scale with a current position and a zero point.

Two representations share that meaning:
  int      — the character's own maximum, entered at creation within the GM's bounds,
             and a current that moves with play from that maximum down to 0. The GM's
             minimum and maximum bound the entry only: a minimum of 1 means no character
             starts dead. Neither number is ever negative.
  weighted — a list of labelled steps from weight 1.0 (best) to 0.0 (zero point).

The runtime renders both as a bar and a label and never decides what reaching zero means.
"""

from typing import Annotated, List, Literal, Optional, Union

from pydantic import Field, model_validator

from ..base import ContractModel
from .identity import DESCRIPTION_MAX_LENGTH


class IntHitPointsRules(ContractModel):
    """Bounds on the maximum a player may enter — data-entry validation, not a character's
    hit points and not the floor of play, which is always 0. There is no starting value:
    the entry is the character's maximum, and current begins equal to it."""

    representation: Literal["int"] = "int"
    # The lowest and highest maximum a player may set.
    minimum: int = Field(default=1, ge=0)
    maximum: int = Field(ge=1)

    @model_validator(mode="after")
    def check_bounds(self) -> "IntHitPointsRules":
        # Equal is allowed: the GM fixes the maximum and the player has nothing to choose.
        if self.minimum > self.maximum:
            raise ValueError("minimum must not exceed maximum")
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
    # GM-written, shown on the form between the hint and the input. Optional.
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    rules: HitPointsRules


class IntHitPointsState(ContractModel):
    """The character's own numbers. Neither may be negative — a data invariant. Whether
    they sit within the rules' bounds is a version difference, never checked here."""

    representation: Literal["int"] = "int"
    maximum: int = Field(ge=0)
    current: int = Field(ge=0)


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
