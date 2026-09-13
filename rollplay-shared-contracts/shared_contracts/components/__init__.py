# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character components — the platform-owned vocabulary a campaign composes a character from.

Each component module declares a *configuration* model (the GM's parameters, stored on the
campaign's character config) and a *value* model (a player's instance, stored on the
character). The two unions below are the only place the list of component types is
written; api-site, api-game and the frontend all dispatch on the `type` discriminator.

Adding a component = one new module here + one entry in each union + tests.
"""

from typing import Annotated, Union

from pydantic import Field

from .attribute import AttributeConfiguration, AttributeValue
from .hit_points import (
    HitPointsConfiguration,
    HitPointsRules,
    HitPointsState,
    HitPointsValue,
    IntHitPointsRules,
    IntHitPointsState,
    ScaleStep,
    WeightedHitPointsRules,
    WeightedHitPointsState,
)
from .name import NameConfiguration, NameValue

ComponentConfiguration = Annotated[
    Union[NameConfiguration, HitPointsConfiguration, AttributeConfiguration],
    Field(discriminator="type"),
]

ComponentValue = Annotated[
    Union[NameValue, HitPointsValue, AttributeValue],
    Field(discriminator="type"),
]

# Platform-fixed order of component types on every runtime surface (sheet, seat card).
# GM config order applies within a type. The player's create form does NOT use this —
# it keeps the GM's config order.
RUNTIME_TYPE_ORDER = ("name", "hit_points", "attribute")

__all__ = [
    "AttributeConfiguration",
    "AttributeValue",
    "ComponentConfiguration",
    "ComponentValue",
    "HitPointsConfiguration",
    "HitPointsRules",
    "HitPointsState",
    "HitPointsValue",
    "IntHitPointsRules",
    "IntHitPointsState",
    "NameConfiguration",
    "NameValue",
    "RUNTIME_TYPE_ORDER",
    "ScaleStep",
    "WeightedHitPointsRules",
    "WeightedHitPointsState",
]
