# Campaign & Character — system-agnostic redesign (high level)

> **Status: DRAFT, 2026-09-12.** High-level shape only. Detail is extracted per stage when
> its turn comes. Existing plans this supersedes are collected in `existing_plans/`.

## Context

Tabletop has been a D&D app end to end: the SRD gates character creation, the runtime reads
D&D fields, the vocabulary assumes D&D. The product becomes a **system-agnostic virtual
tabletop**: the platform provides the table and the tooling; the group brings whatever game
they play. The **campaign is the top-level config** that games and characters under it adopt.

The D&D ruleset is kept as a **framework preset** a GM may copy into a campaign. It is
content, never a mode. The runtime's D&D prompting is stripped now; config-driven prompts
are a later question.

## The model

| Owns | What |
|---|---|
| **Campaign** | The world and its baseline: assets, notes, NPC baselines, seats, and the **character config** (shape of a character). Owns no character instances. |
| **Session** | The table: roster (one seat per user, one character per seat), schedule. The mapping between cold config and hot play. **Characters live here.** |
| **Game** | Hot runtime. Owns no data. Consumes the config it is handed. |
| **User** | Owns their characters outright. |

Decisions locked (2026-09-12):
- Characters are **bound to** a session (own aggregate, referenced by ID from the roster), never contained by it.
- **One character per user per session.** A dead character is ejected from the seat; the player joins with a new one.
- Characters **survive campaign deletion as keepsakes** — readable, unplayable.
- **Character config is versioned.** A GM edit produces a new version. Characters record the version that built them and keep playing. Difference is information for the GM, never a gate — *the app has no notion of an incompatible character.*
- **Create eligibility.** A character is created by a session member against that session's campaign config. Zero eligible sessions = nothing to create against; that empty state is designed, not hidden.

## Vocabulary (define early, use everywhere)

| Term | Meaning | Owner |
|---|---|---|
| **Component** | A way a character can be described, shipped and owned by *us*. *Hit points* is a component: we define it as the way a character can be hit. A component **is a schema** — which parameters exist and what values are legal — so components are contracted like everything else. | Platform (code) |
| **Component configuration** | A GM's parameterised instance of a component inside a campaign — the baseline. Pseudo: `HitPoints(label='energy', type=int, min=1, max=20)`. | GM, on the campaign |
| **Component value** | A player's instance of a configured component on their character: *this character has 5 energy*. | Character (user) |
| **Character config** | The ordered set of component configurations a campaign declares. Versioned. | Campaign |
| **Character config version** | An immutable snapshot of a character config. Characters reference one. | Campaign |
| **Character create flow** | The player-facing creation form rendered from a character config version. | Derived, not stored |
| **Character** | User-owned; bound to a session; references a config version; holds component values + runtime state. | User |
| **Seat / roster** | The session's mapping user → character → role. Party is the roster, a value, not an aggregate (per 07). | Session |
| **Framework preset** | A pre-authored character config (e.g. D&D SRD) a GM copies into a campaign. | Platform content |

Still to define (next pass, not now): how a component declares which runtime surfaces it
appears on (seat card, sheet, log); what "runtime state" means per component; naming of
the World section's contents.

## Contracts — strict shape, free parameters

**Problem.** Shared contracts are `extra="forbid"` throughout and that reliability must
survive. But a GM chooses what a character is made of, so the contract cannot list fields.

**Approach: the freedom is in *which* components, *how many*, *which representation* and
*what parameters* — never in shape.** The GM composes from schemas we author, so the
contract always has a model to validate against. What is unknown until call-time is
cardinality and values, and Pydantic handles both.

- **Components are schemas.** One module per component under a new
  `shared_contracts/components/` package, each declaring a configuration model (the GM's
  parameters) and a value model (the player's instance), both carrying
  `type: Literal["hit_points"]`. Every leaf stays `extra="forbid"`.
- **`CharacterConfig`** is `version` + `components: list[ComponentConfiguration]`, **with no
  bounds and no required types.** Three hit-point components are three entries with the
  same `type`, three GM ids, three labels. Zero is also legal. The contract validates each
  entry; it never says which types must appear or how often — that would be the app taking
  a rules position.
- **Two discriminated unions on `type`** (`ComponentConfiguration`, `ComponentValue`),
  assembled in the package init. Same pattern as `VisualOverlay` in
  `shared_contracts/cine.py:40`.
- **Representations are a second discriminator nested inside the concept.** In DDD terms,
  hit points is the concept; *int* and *weighted* are two value-object variants of it, each
  with its own configuration and value. Roughly:

  ```python
  class IntHitPointsConfiguration(ContractModel):
      representation: Literal["int"]
      min: int
      max: int

  class WeightedHitPointsConfiguration(ContractModel):
      representation: Literal["weighted"]
      scale: dict[float, str]          # {1.0: "full", 0.8: "high", …, 0.0: "zero"}

  class HitPointsConfiguration(ContractModel):
      type: Literal["hit_points"]
      id: str                          # the GM's instance id
      label: str
      rules: IntHitPointsConfiguration | WeightedHitPointsConfiguration   # discriminator: representation

  class IntHitPointsValue(ContractModel):
      representation: Literal["int"]
      current: int

  class WeightedHitPointsValue(ContractModel):
      representation: Literal["weighted"]
      current: float                   # a key of the scale

  class HitPointsValue(ContractModel):
      type: Literal["hit_points"]
      component_id: str
      state: IntHitPointsValue | WeightedHitPointsValue                   # discriminator: representation
  ```

  The outer union picks the component, the inner picks the variant. A game receiving a
  value resolves both and holds a fully typed object without knowing in advance which
  variant it would get.
- **What makes two variants the same component:** shared behaviour the runtime relies on.
  Both hit-point variants are an ordered scale with a current position and a zero; damage
  moves you down it. An unordered label with no zero is a *Choice* component, not a
  hit-points variant.
- **Semantic vs primitive components.** Semantic components have runtime behaviour (hit
  points can be damaged, can reach zero). Primitive components — Number, Text, Choice — are
  display-only. Both fit the unions. The component fixes the value's primitive type; the GM
  does not choose it. The SRD preset will be mostly primitive plus a few semantic.
- **Pairing is a cross-field invariant, checked where config and value meet** (character
  aggregate, runtime), not in the leaf. Same `type` and same `representation` between a
  value and its configuration by id is a **data invariant — hard block.** A value that no
  longer fits its configuration's *parameters* after a GM edit (a weighted `current` that
  is no longer a key of the scale) is a **version difference — surface, never block.** That
  is facilitate-don't-enforce expressed as two validators.
- **Components are schemas, so the editor reads the schema.** Each configuration model
  exports its JSON schema; api-site serves the list; the campaign's Character section
  renders parameter forms from it. No hand-mirrored field list in JS — the drift bug we
  have hit four times.
- **The runtime dispatches on type.** api-game stores the config version in the room
  document at Start and values under each player; one mutation endpoint keyed by component
  id, validated against the value union. Only the renderer for a type knows what it means.
- **Growing the catalogue is additive and a coordinated deploy.** A new representation is
  one configuration model, one value model, one renderer branch; a new component likewise.
  api-site and api-game release under one pin, so union growth is safe. The frontend
  renderer registry carries a **generic fallback** (label + raw value) for a type it has no
  renderer for, so deploy skew degrades rather than breaks.
- **Version snapshots are whole documents.** A config version is stored as one validated
  JSON document, never reassembled from rows. Characters and rooms reference it by id, so
  "built on 1.0.0, campaign is on 1.0.1" is one comparison and no migration.
- The existing opaque `Dict[str, Any]` escape hatch (`map.py:138`) is **not** the mechanism.
  It would give up validation exactly where we need it most.

Both services and the frontend read the same shapes; the frontend keeps trusting JSON as
today (no TS mirror exists; hand-copied constants carry a pointer comment).

## Deliverable — one end-to-end proof

Two workstreams, shipped together, because a campaign config can only be dogfooded through
a character created against it and played.

**A. Campaign create view** replaces the modal (`CampaignManager.js` + `useCampaignMutations.js`).
A dedicated authenticated page: left tabs **Overview · World · Character**, top tabs for
sub-sections. Reuse the workshop route-group layout pattern
(`rollplay/app/(authenticated)/workshop/*`, `WorkshopToolNav.js`, `useWorkshopToolNav.js`).
**Create and edit are one surface** — the drawer's edit modal goes with the create modal.
**World is a stub in v1** (tab present, placeholder content); Overview and Character carry
the real content. Backend: extend `CreateCampaign` / `UpdateCampaign` with
`character_config`; the endpoint keeps composing `CreateSession` (one session for life).

**B. Character config → flow → runtime**, proved with **hit points**:
1. GM configures a hit-points component in the campaign's Character section.
2. Player, as a session member, opens the character create flow, which renders from the config
   version, and creates a character bound to the session. The session roster seats it.
3. Player enters a game. The Start ETL sends the config version + component values per
   player instead of the D&D field set (`game/application/commands.py:128-142`).
4. The runtime seat card and sheet render hit points from the component, and HP edits
   write the component value (`gameservice.py:385-450`, `CharacterSheet.js`, `PlayerCard.js`).

**Strip** from the runtime in the same change: hard-coded `character_class`,
`character_race`, `level`, `ac` and any D&D prompting.

**Framework preset**: out of the proof. Recorded as the test of expressiveness: the SRD
becomes a set of component configurations, which today it cannot, being hard-coded.

## Supersedes (retire deliberately when this lands)

- `existing_plans/character_v2/` — the SRD wizard as *the* character create flow. Its content
  becomes the framework preset's raw material.
- `existing_plans/character-v2.md` — history.
- `home/05` §"Where players and characters live" — adopted in substance, with these
  changes: characters bind to the **session** not the campaign; **one** per user per
  session, not many; config versioning as described here.
- `home/05` v1 publish flow — **not** in this work; still parked.
- `existing_plans/TODO-character-enrollment-and-identity.md` — likely moot (Matt's hunch
  the email leak is fixed; enrollment is superseded by session-scoped creation). Confirm
  during build, then delete.
- `core/product-principles.md:41` — the completeness-plan update instruction dies with the
  completeness plan.

## Verification

End-to-end, by hand, on the dev stack: create a campaign with a hit-points component named
something un-D&D; invite a second user; that user creates a character through the flow;
start a game; both clients show the component by the GM's name; edit it in-game; end the
game; the value is on the character row. Then edit the config to a new version and confirm
the existing character still enters the next game, flagged as built on the older version.

Backend: contract round-trip tests in `rollplay-shared-contracts/tests/test_contracts.py`
(CI gate requires an import per module); api-site and api-game suites in their containers.
