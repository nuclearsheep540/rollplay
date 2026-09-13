# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""The platform's component catalogue.

Components are schemas, so the campaign builder reads the schema rather than mirroring a
field list in JavaScript — the drift this repository has hit four-plus times. Adding a
component to shared_contracts and to COMPONENT_CATALOGUE is all the builder needs to offer
it; nothing on the frontend enumerates parameters by hand.
"""

from typing import Any, Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from shared.dependencies.auth import get_current_user_id
from shared_contracts.components.attribute import AttributeConfiguration, AttributeValue
from shared_contracts.components.hit_points import HitPointsConfiguration, HitPointsValue
from shared_contracts.components.identity import IdentityConfiguration, IdentityValue

router = APIRouter()

# Palette order, which is the order the builder lists them in.
COMPONENT_CATALOGUE = [
    ("identity", "Identity", IdentityConfiguration, IdentityValue),
    ("hit_points", "Hit points", HitPointsConfiguration, HitPointsValue),
    ("attribute", "Attribute", AttributeConfiguration, AttributeValue),
]


class ComponentCatalogueEntry(BaseModel):
    type: str
    label: str
    config_schema: Dict[str, Any]
    value_schema: Dict[str, Any]


@router.get("", response_model=List[ComponentCatalogueEntry])
def list_components(_: object = Depends(get_current_user_id)):
    """Every component a campaign may compose a character from, with its JSON schemas."""
    return [
        ComponentCatalogueEntry(
            type=component_type,
            label=label,
            config_schema=configuration_model.model_json_schema(),
            value_schema=value_model.model_json_schema(),
        )
        for component_type, label, configuration_model, value_model in COMPONENT_CATALOGUE
    ]
