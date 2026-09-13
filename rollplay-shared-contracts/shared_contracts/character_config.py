# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character config — one immutable version of a campaign's character shape — and the
pairing of a character's values with the config that built them.

Boundaries this crosses: api-site <-> PostgreSQL JSONB (whole document), api-site ->
api-game (SessionStartPayload.character_configs), api-game <-> browser (room document),
and the frontend's create flow and runtime renderers.
"""

from typing import Dict, List, Literal

from pydantic import Field, model_validator

from .base import ContractModel
from .components import ComponentConfiguration, ComponentValue


class CharacterConfig(ContractModel):
    """The whole document. Never reassembled from rows; never partially written."""

    version: int = Field(ge=1)
    components: List[ComponentConfiguration] = []

    @model_validator(mode="after")
    def check_unique_ids(self) -> "CharacterConfig":
        seen = set()
        for component in self.components:
            if component.id in seen:
                raise ValueError(f"duplicate component id: {component.id}")
            seen.add(component.id)
        return self

    def configuration_by_id(self) -> Dict[str, ComponentConfiguration]:
        return {component.id: component for component in self.components}


class CharacterSheet(ContractModel):
    """A character's values paired with its own config version.

    Raises:
        ValidationError: on a data invariant, which is always blocked —
            a values key that differs from that value's component_id; a value whose
            component_id is not in the config; a value whose type differs from its
            configuration's; a hit-points state whose representation differs from its
            rules'; a Name value longer than its configuration's max_length.

    Never raises for a value outside its configuration's *range* (an attribute score above
    maximum, a hit-points current outside minimum..maximum, a weight no longer on the
    scale). Those are version differences: reported by diff_configs, shown to the GM, never
    blocked. A value may also be absent for a configured component (a secret value stripped
    for this viewer, or a draft in progress); absence is not an error.
    """

    config: CharacterConfig
    values: Dict[str, ComponentValue] = {}

    @model_validator(mode="after")
    def check_pairing(self) -> "CharacterSheet":
        configurations = self.config.configuration_by_id()
        for key, value in self.values.items():
            if key != value.component_id:
                raise ValueError(f"values key {key!r} does not match component_id {value.component_id!r}")
            configuration = configurations.get(value.component_id)
            if configuration is None:
                raise ValueError(f"no component {value.component_id!r} in config version {self.config.version}")
            if configuration.type != value.type:
                raise ValueError(
                    f"component {value.component_id!r} is {configuration.type!r}, value is {value.type!r}"
                )
            if configuration.type == "hit_points":
                if configuration.rules.representation != value.state.representation:
                    raise ValueError(
                        f"component {value.component_id!r} is represented as "
                        f"{configuration.rules.representation!r}, value is {value.state.representation!r}"
                    )
            if configuration.type == "name":
                if len(value.text) > configuration.max_length:
                    raise ValueError(
                        f"component {value.component_id!r} text exceeds max_length {configuration.max_length}"
                    )
        return self


class ComponentChange(ContractModel):
    component_id: str
    kind: Literal["added", "removed", "changed"]
    label: str
    # For "changed": dotted paths of the configuration fields that differ, e.g. "rules.maximum".
    fields: List[str] = []


def diff_configs(older: CharacterConfig, newer: CharacterConfig) -> List[ComponentChange]:
    """Structural difference between two config versions, keyed by component id.

    Pure function. Produces information for the GM ("built on v1: Wits removed, Vitality
    maximum changed"). It never returns a verdict and nothing may treat its output as one.
    Order: removed (in older order), changed (in older order), added (in newer order).
    """
    older_by_id = older.configuration_by_id()
    newer_by_id = newer.configuration_by_id()
    changes: List[ComponentChange] = []

    for component_id, older_component in older_by_id.items():
        if component_id not in newer_by_id:
            changes.append(ComponentChange(component_id=component_id, kind="removed", label=older_component.label))

    for component_id, older_component in older_by_id.items():
        newer_component = newer_by_id.get(component_id)
        if newer_component is None:
            continue
        changed_fields = _changed_fields(older_component.model_dump(), newer_component.model_dump(), prefix="")
        if changed_fields:
            changes.append(
                ComponentChange(
                    component_id=component_id, kind="changed", label=newer_component.label, fields=changed_fields
                )
            )

    for component_id, newer_component in newer_by_id.items():
        if component_id not in older_by_id:
            changes.append(ComponentChange(component_id=component_id, kind="added", label=newer_component.label))

    return changes


def _changed_fields(older: dict, newer: dict, prefix: str) -> List[str]:
    """Dotted paths whose values differ. Lists (the weighted scale) compare whole: one path."""
    changed: List[str] = []
    for field_name in sorted(set(older) | set(newer)):
        path = f"{prefix}{field_name}"
        older_value = older.get(field_name)
        newer_value = newer.get(field_name)
        if isinstance(older_value, dict) and isinstance(newer_value, dict):
            changed.extend(_changed_fields(older_value, newer_value, prefix=f"{path}."))
        elif older_value != newer_value:
            changed.append(path)
    return changed
