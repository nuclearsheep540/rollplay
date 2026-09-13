# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Attribute component — a labelled integer within a GM-declared range, with an optional default."""

from typing import Literal, Optional

from pydantic import Field, model_validator

from ..base import ContractModel
from .identity import DESCRIPTION_MAX_LENGTH


class AttributeConfiguration(ContractModel):
    type: Literal["attribute"] = "attribute"
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=60)
    secret: bool = False
    # GM-written, shown on the form between the hint and the input. Optional.
    description: Optional[str] = Field(default=None, max_length=DESCRIPTION_MAX_LENGTH)
    minimum: int
    maximum: int
    default: Optional[int] = None

    @model_validator(mode="after")
    def check_bounds(self) -> "AttributeConfiguration":
        if self.minimum >= self.maximum:
            raise ValueError("minimum must be less than maximum")
        if self.default is not None and not (self.minimum <= self.default <= self.maximum):
            raise ValueError("default must lie between minimum and maximum")
        return self


class AttributeValue(ContractModel):
    type: Literal["attribute"] = "attribute"
    component_id: str = Field(min_length=1, max_length=64)
    # Range-blind for the same reason as HitPointsValue.state — see that comment.
    score: int
