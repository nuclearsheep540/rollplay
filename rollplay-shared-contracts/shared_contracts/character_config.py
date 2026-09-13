# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character config — one immutable version of a campaign's character shape — and the
pairing of a character's values with the config that built them.

Boundaries this crosses: api-site <-> PostgreSQL JSONB (whole document), api-site ->
api-game (SessionStartPayload.character_configs), api-game <-> browser (room document),
and the frontend's create flow and runtime renderers.
"""

from typing import Annotated, Dict, List, Literal, Optional, Set, Union

from pydantic import ValidationError

from pydantic import Field, model_validator

from .base import ContractModel
from .components import ComponentConfiguration, ComponentValue
from .components.attribute import AttributeValue
from .components.hit_points import HitPointsValue, IntHitPointsState, WeightedHitPointsState
from .components.identity import IdentityValue, MultiSelectIdentityAnswer, TextIdentityAnswer


class ComponentGroup(ContractModel):
    """A GM-named section of the create form, holding an ordered run of components.

    One level deep: a group's members are components, never groups. It exists for the
    form — the runtime sheet keeps the platform-fixed type order and ignores it — but it
    is part of the versioned config, because a player builds against the sections too.
    """

    type: Literal["group"] = "group"
    id: str = Field(min_length=1)
    label: str = Field(min_length=1, max_length=60)
    components: List[ComponentConfiguration] = []


# One top-level entry: a bare component, or a group of them. The list of entries is the
# form's order; a bare component is simply one that sits in no section.
ConfigEntry = Annotated[Union[ComponentConfiguration, ComponentGroup], Field(discriminator="type")]


class CharacterConfig(ContractModel):
    """The whole document. Never reassembled from rows; never partially written."""

    version: int = Field(ge=1)
    components: List[ConfigEntry] = []

    @model_validator(mode="after")
    def check_unique_ids(self) -> "CharacterConfig":
        seen = set()
        for entry in self.components:
            for entry_id in _ids_of(entry):
                if entry_id in seen:
                    raise ValueError(f"duplicate component id: {entry_id}")
                seen.add(entry_id)
        return self

    def flat_components(self) -> List[ComponentConfiguration]:
        """Every component in form order, the group boundaries forgotten. What anything
        that is not the form wants — pairing, secrets, the display name."""
        flat: List[ComponentConfiguration] = []
        for entry in self.components:
            if entry.type == "group":
                flat.extend(entry.components)
            else:
                flat.append(entry)
        return flat

    def configuration_by_id(self) -> Dict[str, ComponentConfiguration]:
        return {component.id: component for component in self.flat_components()}

    def group_of(self) -> Dict[str, Optional[str]]:
        """Component id -> the id of the group it sits in, or None for a bare component."""
        membership: Dict[str, Optional[str]] = {}
        for entry in self.components:
            if entry.type == "group":
                for component in entry.components:
                    membership[component.id] = entry.id
            else:
                membership[entry.id] = None
        return membership

    def groups_by_id(self) -> Dict[str, ComponentGroup]:
        return {entry.id: entry for entry in self.components if entry.type == "group"}


def _ids_of(entry) -> List[str]:
    if entry.type == "group":
        return [entry.id] + [component.id for component in entry.components]
    return [entry.id]


class CharacterSheet(ContractModel):
    """A character's values paired with its own config version.

    Raises:
        ValidationError: on a data invariant, which is always blocked —
            a values key that differs from that value's component_id; a value whose
            component_id is not in the config; a value whose type differs from its
            configuration's; a hit-points state whose representation differs from its
            rules'; an identity answer whose kind differs from its input's; a text answer
            longer than its input's max_length.

    Never raises for a value outside its configuration's *range* (an attribute score above
    maximum, a hit-points current outside minimum..maximum, a weight no longer on the
    scale, a choice no longer among the options). Those are version differences: reported by diff_configs, shown to the GM, never
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
            if configuration.type == "identity":
                if configuration.input.kind != value.answer.kind:
                    raise ValueError(
                        f"component {value.component_id!r} is answered by "
                        f"{configuration.input.kind!r}, value is {value.answer.kind!r}"
                    )
                if value.answer.kind == "text" and len(value.answer.text) > configuration.input.max_length:
                    raise ValueError(
                        f"component {value.component_id!r} text exceeds max_length {configuration.input.max_length}"
                    )
        return self


class ComponentChange(ContractModel):
    # A component's id, or a group's: a group is added, removed or renamed like anything else.
    component_id: str
    kind: Literal["added", "removed", "changed"]
    label: str
    # For "changed": dotted paths of the configuration fields that differ, e.g. "rules.maximum".
    fields: List[str] = []


def diff_configs(older: CharacterConfig, newer: CharacterConfig) -> List[ComponentChange]:
    """Structural difference between two config versions, keyed by component id.

    Pure function. Produces information for the GM ("built on v1: Wits removed, Vitality
    maximum changed"). It never returns a verdict and nothing may treat its output as one.
    Order: removed (in older order), changed (in older order), added (in newer order);
    within each, groups before the components.

    Groups are compared by label only. Their membership is reported on the members: a
    component that moved into, out of or between groups has changed "position", the same
    field as a component dragged elsewhere in the list.
    """
    older_by_id = older.configuration_by_id()
    newer_by_id = newer.configuration_by_id()
    older_groups = older.groups_by_id()
    newer_groups = newer.groups_by_id()
    changes: List[ComponentChange] = []

    for group_id, older_group in older_groups.items():
        if group_id not in newer_groups:
            changes.append(ComponentChange(component_id=group_id, kind="removed", label=older_group.label))
    for component_id, older_component in older_by_id.items():
        if component_id not in newer_by_id:
            changes.append(ComponentChange(component_id=component_id, kind="removed", label=older_component.label))

    for group_id, older_group in older_groups.items():
        newer_group = newer_groups.get(group_id)
        if newer_group is not None and older_group.label != newer_group.label:
            changes.append(
                ComponentChange(component_id=group_id, kind="changed", label=newer_group.label, fields=["label"])
            )

    # Order is part of the config — the form renders it — so a component that moved is a
    # change with "position" among its fields. The minimal set of moves is reported: one
    # drag shifts every other index, and flagging them all would read as the whole config
    # changing.
    moved = _moved_ids(list(older_by_id), list(newer_by_id))
    older_membership = older.group_of()
    newer_membership = newer.group_of()

    for component_id, older_component in older_by_id.items():
        newer_component = newer_by_id.get(component_id)
        if newer_component is None:
            continue
        changed_fields = _changed_fields(older_component.model_dump(), newer_component.model_dump(), prefix="")
        if component_id in moved or older_membership[component_id] != newer_membership[component_id]:
            changed_fields.append("position")
        if changed_fields:
            changes.append(
                ComponentChange(
                    component_id=component_id, kind="changed", label=newer_component.label, fields=changed_fields
                )
            )

    for group_id, newer_group in newer_groups.items():
        if group_id not in older_groups:
            changes.append(ComponentChange(component_id=group_id, kind="added", label=newer_group.label))
    for component_id, newer_component in newer_by_id.items():
        if component_id not in older_by_id:
            changes.append(ComponentChange(component_id=component_id, kind="added", label=newer_component.label))

    return changes


def _moved_ids(older_ids: List[str], newer_ids: List[str]) -> Set[str]:
    """The components that moved, as the smallest set whose removal leaves both orders
    agreeing — the ids not on a longest common subsequence of the two sequences, taken
    over the ids present in both."""
    older_set, newer_set = set(older_ids), set(newer_ids)
    older_shared = [component_id for component_id in older_ids if component_id in newer_set]
    newer_shared = [component_id for component_id in newer_ids if component_id in older_set]

    # Longest common subsequence by dynamic programming; the lists are a handful long.
    rows, columns = len(older_shared), len(newer_shared)
    lengths = [[0] * (columns + 1) for _ in range(rows + 1)]
    for row in range(rows - 1, -1, -1):
        for column in range(columns - 1, -1, -1):
            if older_shared[row] == newer_shared[column]:
                lengths[row][column] = lengths[row + 1][column + 1] + 1
            else:
                lengths[row][column] = max(lengths[row + 1][column], lengths[row][column + 1])

    unmoved: Set[str] = set()
    row = column = 0
    while row < rows and column < columns:
        if older_shared[row] == newer_shared[column]:
            unmoved.add(older_shared[row])
            row += 1
            column += 1
        elif lengths[row + 1][column] >= lengths[row][column + 1]:
            row += 1
        else:
            column += 1

    return {component_id for component_id in newer_shared if component_id not in unmoved}


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


def initial_value_for(configuration: ComponentConfiguration) -> ComponentValue:
    """What a player's input starts at for one configuration — the mirror of the
    frontend's initialValueFor. The GM's default where they declared one; hit points at
    the top of the entry range (a full character); an identity unanswered."""
    if configuration.type == "identity":
        kind = configuration.input.kind
        answer = (
            TextIdentityAnswer(text="") if kind == "text"
            else MultiSelectIdentityAnswer(choices=[]) if kind == "multi_select"
            else None
        )
        if answer is None:
            # A single choice has no honest "unanswered" — the answer model requires a
            # choice — so the seed is absent and the form asks for it.
            raise ValueError("a single-select identity has no initial value")
        return IdentityValue(component_id=configuration.id, answer=answer)
    if configuration.type == "hit_points":
        if configuration.rules.representation == "int":
            state = IntHitPointsState(maximum=configuration.rules.maximum, current=configuration.rules.maximum)
        else:
            state = WeightedHitPointsState(current_weight=configuration.rules.starting_weight)
        return HitPointsValue(component_id=configuration.id, state=state)
    if configuration.type == "attribute":
        score = configuration.default if configuration.default is not None else configuration.minimum
        return AttributeValue(component_id=configuration.id, score=score)
    raise ValueError(f"no initial value for component type {configuration.type!r}")


class Reconciliation(ContractModel):
    """A character's values carried from one config version to another, and what
    happened to each: kept as they were, seeded because the component is new, dropped
    because it is gone, or reset because its shape changed underneath the value."""

    values: Dict[str, ComponentValue]
    kept: List[str] = []
    added: List[str] = []
    dropped: List[str] = []
    reset: List[str] = []


def reconcile_values(
    older: CharacterConfig, newer: CharacterConfig, values: Dict[str, ComponentValue]
) -> Reconciliation:
    """Carry values built against `older` forward to `newer`.

    Pure function; the proposal a player confirms, never applied on its own. A value is
    kept when it still pairs with its component under the new config — a range it has
    fallen outside of is still kept, as everywhere else. It is reset (seeded afresh) when
    the component's kind or representation changed, because the old value has no meaning
    against the new shape. A component the new config lacks loses its value; one the old
    config lacked is seeded. A single-select identity that must be seeded is left absent
    for the form to ask.
    """
    older_by_id = older.configuration_by_id()
    newer_by_id = newer.configuration_by_id()
    carried: Dict[str, ComponentValue] = {}
    kept: List[str] = []
    added: List[str] = []
    reset: List[str] = []

    def seed(component_id: str) -> None:
        try:
            carried[component_id] = initial_value_for(newer_by_id[component_id])
        except ValueError:
            pass

    for component_id in newer_by_id:
        if component_id not in older_by_id:
            added.append(component_id)
            seed(component_id)
            continue
        value = values.get(component_id)
        if value is None:
            continue
        try:
            CharacterSheet(config=newer, values={component_id: value})
        except ValidationError:
            reset.append(component_id)
            seed(component_id)
            continue
        carried[component_id] = value
        kept.append(component_id)

    dropped = [component_id for component_id in values if component_id not in newer_by_id]
    return Reconciliation(values=carried, kept=kept, added=added, dropped=dropped, reset=reset)
