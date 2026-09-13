# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Name component — a short text the character is called by.

A campaign may configure any number of Name components (or none). The platform derives a
character's display name by joining every Name value in config order with single spaces;
see api-site's CharacterAggregate.derive_display_name.
"""

from typing import Literal

from pydantic import Field

from ..base import ContractModel

NAME_MAX_LENGTH_CEILING = 200


class NameConfiguration(ContractModel):
    type: Literal["name"] = "name"
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=60)
    secret: bool = False
    max_length: int = Field(default=60, ge=1, le=NAME_MAX_LENGTH_CEILING)
    required: bool = True


class NameValue(ContractModel):
    type: Literal["name"] = "name"
    component_id: str = Field(min_length=1, max_length=64)
    # The configuration's max_length is enforced at pairing (CharacterSheet), not here —
    # a value model cannot see its configuration. The ceiling here is the platform's.
    text: str = Field(max_length=NAME_MAX_LENGTH_CEILING)
