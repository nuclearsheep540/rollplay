# 01 — Shared contracts: components, character config, pairing, diff

> Read `00-agent-brief.md` first. This file is the complete specification for PR 1. Every
> model below is to be written exactly as shown unless a stated reason forces a change; if
> one does, record the reason in the PR notes rather than silently diverging.

## Scope of this PR

Package: `rollplay-shared-contracts/`. Nothing outside it changes in this PR except the CI
workflow (`.github/workflows/contracts.yml`). No api-site, api-game or frontend code.

Deliverables:
1. New subpackage `shared_contracts/components/` with three component modules.
2. New module `shared_contracts/character_config.py`.
3. Changes to `shared_contracts/character.py` (`PlayerCharacter`) and
   `shared_contracts/session.py` (`SessionStartPayload`, `PlayerState`).
4. Re-exports in `shared_contracts/__init__.py`.
5. Tests in `tests/test_contracts.py` for every new module and every changed model.
6. The CI coverage gate made subpackage-aware.
7. Delete the stale build artefact `rollplay-shared-contracts/build/` (it is a copy of the
   package; it is not consumed by anything; confirm with `grep -r "build/lib" ..` returning
   nothing outside `build/` itself before deleting).
8. Bump `pyproject.toml` version `0.3.0` → `0.4.0`.

## Rules that apply in this package

- Every model inherits `ContractModel` from `shared_contracts/base.py`. Do not set
  `model_config` on any subclass; `extra="forbid"` is inherited.
- Python 3.9 syntax: `Union[...]`, `Optional[...]`, `List[...]`, `Dict[...]`,
  `Annotated[...]`, `Literal[...]` from `typing`. Never `X | Y`, never `list[X]`.
- Discriminated unions are declared exactly as `VisualOverlay` is in
  `shared_contracts/cine.py`: `Annotated[Union[A, B], Field(discriminator="type")]`.
- Validators use Pydantic v2 `@field_validator` / `@model_validator(mode="after")`.
- License header on every new file:
  ```python
  # Copyright (C) 2025 Matthew Davey
  # SPDX-License-Identifier: GPL-3.0-or-later
  ```
- Module docstrings state what the boundary is, in the style of `cine.py`'s docstring.
- No lazy imports. No single-letter names. Loop variables are words.

## File: `shared_contracts/components/__init__.py`

```python
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
```

## File: `shared_contracts/components/name.py`

```python
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
```

## File: `shared_contracts/components/hit_points.py`

```python
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
    state: HitPointsState
```

Note what is deliberately **not** validated on the value: `current` against the rules'
range, `current_weight` against the scale. Those are pairing concerns (axis 2 vs axis 3
is decided in `CharacterSheet`, below). A value model must accept any well-typed number.

## File: `shared_contracts/components/attribute.py`

```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Attribute component — a labelled integer within a GM-declared range, with an optional default."""

from typing import Literal, Optional

from pydantic import Field, model_validator

from ..base import ContractModel


class AttributeConfiguration(ContractModel):
    type: Literal["attribute"] = "attribute"
    id: str = Field(min_length=1, max_length=64)
    label: str = Field(min_length=1, max_length=60)
    secret: bool = False
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
    score: int
```

## File: `shared_contracts/character_config.py`

```python
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

"""Character config — one immutable version of a campaign's character shape — and the
pairing of a character's values with the config that built them.

Boundaries this crosses: api-site ⇄ PostgreSQL JSONB (whole document), api-site → api-game
(SessionStartPayload.character_configs), api-game ⇄ browser (room document), and the
frontend's create flow and runtime renderers.
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

    Raises ValidationError (data invariant, always blocked) when:
      - a values key differs from that value's component_id,
      - a value's component_id is not a component of the config,
      - a value's type differs from its configuration's type,
      - a hit-points state's representation differs from its rules' representation,
      - a Name value's text is longer than its configuration's max_length.

    Never raises for a value outside its configuration's *range* (an attribute score above
    maximum, a hit-points current outside minimum..maximum, a weight no longer on the scale).
    Those are version differences: reported by diff_configs, shown to the GM, never blocked.
    A value may also be absent for a configured component (a secret value stripped for this
    viewer, or a draft in progress); absence is not an error.
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
```

## Changes to `shared_contracts/character.py`

Replace `PlayerCharacter` with:

```python
class PlayerCharacter(ContractModel):
    """Character metadata for a rostered player in game ETL.

    Carries identity plus the character's component values and the id of the config
    version that built them. The config itself rides once per version in
    SessionStartPayload.character_configs. No rules fields: api-game renders whatever the
    values are, by component type.
    """

    user_id: str
    player_name: str
    campaign_role: str
    character_id: str
    display_name: str
    config_version_id: str
    values: Dict[str, ComponentValue] = {}
    color: Optional[str] = None
    avatar_asset_id: Optional[str] = None
```

Import `ComponentValue` from `.components`. Keep `DungeonMaster` and `SessionUser`
unchanged. Update the module docstring to drop "DM" in favour of "GM" only in prose; the
class name `DungeonMaster` and field `dungeon_master` stay this PR (renaming them is a
cross-service change and is out of scope; note it in `08-followups.md`).

## Changes to `shared_contracts/session.py`

- `SessionStartPayload`: add `character_configs: Dict[str, CharacterConfig] = {}` after
  `session_users`, with the comment: `# config version id -> config, one entry per distinct
  version among session_users; api-game keeps every entry so players on different
  versions both resolve.` Import `CharacterConfig` from `.character_config`.
- `PlayerState`: add `config_version_id: Optional[str] = None` and
  `values: Dict[str, ComponentValue] = {}` with the comment: `# Every value api-game holds
  for this player at End; api-site writes them cold in one update. None/empty when the
  player had no character.` Import `ComponentValue` from `.components`.

## Changes to `shared_contracts/__init__.py`

Add to the imports and to `__all__`, alphabetically within the existing groups:
`AttributeConfiguration, AttributeValue, ComponentConfiguration, ComponentValue,
HitPointsConfiguration, HitPointsValue, IntHitPointsRules, IntHitPointsState,
NameConfiguration, NameValue, RUNTIME_TYPE_ORDER, ScaleStep, WeightedHitPointsRules,
WeightedHitPointsState` from `.components`; `CharacterConfig, CharacterSheet,
ComponentChange, diff_configs` from `.character_config`.

## CI gate: `.github/workflows/contracts.yml`

Replace the coverage loop with one that derives the dotted module path:

```bash
for file in $(find rollplay-shared-contracts/shared_contracts -name '*.py' ! -name '__init__.py'); do
  module=$(echo "$file" | sed 's#^rollplay-shared-contracts/shared_contracts/##; s#\.py$##; s#/#.#g')
  if ! grep -q "from shared_contracts.${module} import" rollplay-shared-contracts/tests/test_contracts.py; then
    echo "ERROR: No import for shared_contracts.${module} in test_contracts.py"
    exit 1
  fi
done
echo "All contract modules have test imports."
```

Run the same loop locally before opening the PR and paste its output in the PR notes.

## Tests: `tests/test_contracts.py`

Add these imports (the gate greps for each `from shared_contracts.<module> import`):

```python
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
from shared_contracts.components.name import NameConfiguration, NameValue
from shared_contracts.character_config import CharacterConfig, CharacterSheet, ComponentChange, diff_configs
```

Add a module-level factory section (fresh objects per call, never module constants):

```python
def make_int_hit_points(component_id="hit_points_1", label="Vitality", **overrides) -> HitPointsConfiguration: ...
def make_weighted_hit_points(component_id="hit_points_2", label="Resolve", **overrides) -> HitPointsConfiguration: ...
def make_attribute(component_id="attribute_1", label="Strength", **overrides) -> AttributeConfiguration: ...
def make_name(component_id="name_1", label="Name", **overrides) -> NameConfiguration: ...
def make_mock_config() -> CharacterConfig:
    """The design mock's config: Name, Vitality (int 0..20 start 10), Resolve (weighted
    Full/High/Mid/Low/Zero = 1.0/0.8/0.6/0.3/0.0), Strength/Agility/Wits (1..20 default 10)."""
def make_mock_values() -> dict:
    """Brannoc Vell: name, Vitality 10, Resolve 1.0, Strength 14, Agility 10, Wits 8."""
```

Test classes, one per concern, in the file's existing style (`class TestX:` with plain
`test_` methods, `pytest.raises(ValidationError)` for rejections):

- `TestNameComponent`: round-trip config and value; `extra="forbid"` on both; `max_length`
  above the ceiling rejected; `label` empty rejected.
- `TestIntHitPoints`: round-trip; `minimum >= maximum` rejected; `starting` outside range
  rejected; state round-trip; **state with `current` outside any range accepted** (the
  value model is range-blind by design; docstring the test to say so).
- `TestWeightedHitPoints`: round-trip; first weight not 1.0 rejected; last weight not 0.0
  rejected; non-descending rejected; `starting_weight` off-scale rejected; fewer than two
  steps rejected; scale survives JSON round-trip as a list (assert `isinstance(list)` after
  `model_validate_json(model_dump_json())`).
- `TestHitPointsDiscriminators`: JSON for an int-ruled config resolves `rules` to
  `IntHitPointsRules`; weighted to `WeightedHitPointsRules`; same for states; a config
  whose `rules` lacks `representation` is rejected; a `type` not in the union is rejected.
- `TestAttributeComponent`: round-trip; bounds rejected; `default` outside range rejected;
  `default` None accepted.
- `TestCharacterConfig`: empty `components` accepted; three hit-points components accepted
  (cardinality is free); duplicate ids rejected; `version` 0 rejected; `configuration_by_id`
  returns every component; the mock config round-trips through JSON identically.
- `TestCharacterSheet`: mock config + mock values validate; values key ≠ component_id
  rejected; unknown component_id rejected; type mismatch (name value on hit_points id)
  rejected; representation mismatch (weighted state on int rules) rejected; Name text
  longer than its configuration's max_length rejected; **attribute score above maximum
  accepted** and **hit-points current above maximum accepted** and **weight not on the
  scale accepted** (three explicit axis-2 tests, docstringed); missing value for a
  configured component accepted.
- `TestDiffConfigs`: identical configs → `[]`; the mock's v1 → v2 case (Vitality maximum
  20→25, Wits removed, Nerve added) returns exactly the three changes in the documented
  order with `fields == ["rules.maximum"]` for Vitality; a label-only change reports
  `fields == ["label"]`; a weighted-scale step change reports `fields == ["rules.scale"]`.
- `TestPlayerCharacterContract` (extend the existing character tests): `PlayerCharacter`
  round-trips with `values`; the old fields (`hp_current`, `character_class`, `level`,
  `ac`, `character_race`, `character_name`) are rejected as extras.
- `TestSessionStartPayload` (extend existing): `character_configs` round-trips; an entry
  whose value is not a `CharacterConfig` is rejected.
- `TestPlayerState` (extend existing): `values` and `config_version_id` round-trip and
  default to empty/None.

Run: `docker exec api-site-dev python -m pytest /rollplay-shared-contracts/tests/ -q`
(host Python is 3.9 and too old for consumers, but this package targets 3.9; the container
is the reference environment either way). All green is the PR gate. Also run the CI loop
above locally.

## Not in this PR

- No consumer changes. api-site and api-game will fail to import `PlayerCharacter` with the
  old fields once they pin `0.4.0`; PRs 2 and 3 do that migration. Until then the services
  stay on `0.3.0`.
- No `Number`, `Text`, `Choice` components. They arrive with the framework preset
  (`08-followups.md`).
- No JSON-schema endpoint (that is api-site, PR 2).
