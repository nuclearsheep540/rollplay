# Character v2 — Completeness Plan (revised)

> **Reading order:** This plan builds on [character-v2.md](character-v2.md) and depends on two reference companions:
> - [srd-edge-case-enumeration.md](srd-edge-case-enumeration.md) — exhaustive list of every choice the SRD 5.2.1 demands
> - [character-v2-current-state-audit.md](character-v2-current-state-audit.md) — what the v2 branch implements today
>
> This plan's prime directive: **extend existing patterns; never invent new ones.** Every change below maps to a pattern that already exists in the codebase, with file/line citations. The pattern catalogue (§3) is the authority on what those patterns are.

---

## 1. Why this exists

The v2 branch shipped a solid foundation — registry, strategies, draft autosave, multi-class, level-up modal. But:

1. **The parser is naïve.** It extracts surface fields and leaves anything deeper as raw text. Every feat has `prerequisites: []`. Class progression columns are captured but their semantics (Fighting Style choice, Divine Order, Metamagic) are not. Species sub-choices are described in prose but never structured.
2. **The aggregate and wizard mirror that naïvety.** Because the parser doesn't surface choice points, the wizard doesn't render them, and the aggregate has no fields to store them.

The fix is to make both layers smarter, simultaneously — **without introducing any new architectural patterns**. Every existing interface, command, repository, schema, hook, and wizard step is already the right shape. The work is to add data and extend handlers, not to invent new abstractions.

## 2. Scope (changed from original v2)

In scope now: spellcasting (slots, cantrips, prepared, known), subclasses (one per class in SRD), Eldritch Invocations, Metamagic, Mystic Arcanum, resource pools, sub-flavour storage (Magic Initiate list, Elemental Affinity damage type, etc.), species sub-choices (lineage, ancestry, legacy), Fighting Style, class L1 feature choices (Divine Order, Primal Order, Hunter's Prey, etc.), Weapon Mastery picks, Expertise pickers, starting at levels > 1, equipment package A/B/C, full spell content parsing, multiclass spell slot math.

Still out of scope: homebrew, mid-life edition swap, inventory management beyond starting equipment, magic items, spell effect resolution, combat encounter automation. Migration is not a concern — no production data exists yet.

---

## 3. Pattern catalogue (the contract this plan binds to)

Every phase below must align with these patterns. **If a proposed change can't be expressed in one of these patterns, the plan is wrong, not the codebase.**

### 3.1 Backend — CQRS-lite

**Commands** live in [api-site/modules/characters/application/commands.py](api-site/modules/characters/application/commands.py). Each command:
- Is a class with `__init__(self, repository, ...) -> None` injecting its dependencies.
- Exposes `execute(self, *, ...) -> Aggregate | bool` with keyword-only args.
- Mutates one aggregate via aggregate methods (never via direct attribute manipulation).
- Calls `repository.save(aggregate)` once at the end.
- Raises `ValueError` for invalid state, `PermissionError` for ownership, `KeyError` for missing references — all mapped to HTTP codes by [`_http()`](api-site/modules/characters/api/endpoints.py#L190).
- Stays sync unless it publishes events (then `async def execute`).

Example: [`UpdateCharacterDraft.execute`](api-site/modules/characters/application/commands.py#L76-L115) dispatches to per-step handlers (`_apply_identity`, `_apply_class`, …) via a `handler = {...}.get(step)` table. **New draft steps extend this table; they don't create new commands.**

**Queries** live in [api-site/modules/characters/application/queries.py](api-site/modules/characters/application/queries.py). Same shape as commands but read-only. Currently tiny ([2 queries](api-site/modules/characters/application/queries.py)): `GetCharacterById`, `GetCharactersByUser`. Add to this file if a new read needs reuse outside a single endpoint.

### 3.2 Backend — Aggregate

The [`CharacterAggregate`](api-site/modules/characters/domain/character_aggregate.py) dataclass:
- Holds state as fields; methods mutate and call `self._touch()` to bump `updated_at`.
- Has **no ORM imports** — pure domain.
- Has **no ruleset math** — takes a `ruleset` parameter for derived calculations (e.g. [`can_level_up(ruleset)`](api-site/modules/characters/domain/character_aggregate.py#L439)).
- Uses immutable value objects: [`AbilityScores`](api-site/modules/characters/domain/character_aggregate.py#L39), [`ClassEntry`](api-site/modules/characters/domain/character_aggregate.py#L76), [`SkillProficiency`](api-site/modules/characters/domain/character_aggregate.py#L88), [`FeatAcquisition`](api-site/modules/characters/domain/character_aggregate.py#L108) — `@dataclass(frozen=True)` with `__post_init__` validation.
- Source-tracks where things came from via the `source` field on value objects (`SKILL_SOURCES = {"CLASS", "BACKGROUND", "FEAT", "SPECIES"}`, `FEAT_SOURCES = {"BACKGROUND_ORIGIN", "ASI", "OTHER"}`).
- Factories: `create_draft()` returns a fresh aggregate; the repository reconstitutes via direct constructor.

### 3.3 Backend — Repository

[`CharacterRepository`](api-site/modules/characters/repositories/character_repository.py):
- Single `_query()` with `selectinload(...)` for all join tables ([line 60](api-site/modules/characters/repositories/character_repository.py#L60)).
- `_model_to_aggregate()` for translation; no separate mapper file (per CLAUDE.md).
- `save(aggregate)` does **replace-style sync for join tables** ([line 286](api-site/modules/characters/repositories/character_repository.py#L286-L298)): delete all child rows, flush, re-add. Comments call this out as intentional — "small tables, easier than diffing."
- Audit-only writes (the choices log) live in their own method [`append_choice_log()`](api-site/modules/characters/repositories/character_repository.py#L370).
- All reads filter `is_deleted=False` by default.

**New join tables follow this exact rhythm:** add to `selectinload`, add a translation block to `_model_to_aggregate`, add a delete-and-rewrite block to `save`, and a builder block in `_write_all_children`.

### 3.4 Backend — Pydantic models

Two namespaces:

**Ruleset content models** ([shared/rulesets/models.py](api-site/shared/rulesets/models.py)) — the single schema authority for SRD content, used by parser output validation, registry typing, and API responses simultaneously. Reference data endpoints return these directly with no DTO mirroring (per [edition_endpoints.py:50](api-site/modules/characters/api/edition_endpoints.py#L50)).

**Character API DTOs** ([modules/characters/api/schemas.py](api-site/modules/characters/api/schemas.py)) — request/response shapes specific to character endpoints. Use `Field(pattern=CodePattern)` for codes, `Field(ge=N, le=M)` for ranges, `Literal[...]` for enums. Reuse `AbilityCode` from `shared.rulesets.models`.

**Step-dispatched request body pattern** — [`UpdateDraftRequest`](api-site/modules/characters/api/schemas.py#L239) has a `step: StepName` literal plus one optional sub-payload per step, only the matching one populated. Add new steps by extending `StepName` and adding a sub-payload field.

### 3.5 Backend — Endpoints

[modules/characters/api/endpoints.py](api-site/modules/characters/api/endpoints.py):
- Single `router = APIRouter()`.
- Each endpoint is ~10-15 lines: `Depends()` for repository/registry/auth/s3, instantiate a command, call `execute()`, return `_to_character_response(...)`.
- Errors → `_http(exc)` → HTTPException with appropriate status.
- Response enrichment via helpers at the top of the file: [`_build_derived_stats()`](api-site/modules/characters/api/endpoints.py#L69) computes ruleset-derived values; [`_to_character_response()`](api-site/modules/characters/api/endpoints.py#L112) composes the full sheet response.

**Reference data endpoints** live in [edition_endpoints.py](api-site/modules/characters/api/edition_endpoints.py) — same router pattern but returns `shared/rulesets/models.py` types directly.

### 3.6 Backend — Ruleset strategy

[`RulesetStrategy`](api-site/shared/rulesets/strategy.py) is an ABC; [`Dnd2024Ruleset`](api-site/shared/rulesets/dnd_2024.py) is the concrete impl. The strategy:
- Takes a registry reference for class/species/feat lookups.
- Static tables as module-level constants (`_XP_THRESHOLDS`, `_PROFICIENCY_BONUS`).
- Each method takes a `CharacterAggregate` and returns a primitive or dict.
- Stateless beyond the registry ref — testable without a DB.

**New computations are new methods on the ABC + impl.** They surface via `_build_derived_stats()`'s `DerivedStats` shape, NOT via new API endpoints.

### 3.7 Backend — Dependency injection

[modules/characters/dependencies/providers.py](api-site/modules/characters/dependencies/providers.py) holds FastAPI `Depends()` factories. Each repository/registry/service has one factory. Endpoints use `repo = Depends(get_character_repository)`. **Don't introduce service locators or alternate DI; this file is the single seam.**

### 3.8 Backend — Domain events (EventConfig)

[`EventConfig`](api-site/modules/events/domain/event_config.py) is the typed contract for broadcastable events. Pattern (from CLAUDE.md):
1. Each module defines a `*Events` static factory class in `domain/<aggregate>_events.py`.
2. Each factory method returns an `EventConfig` (or `List[EventConfig]` for multi-recipient).
3. Commands that publish events are `async def execute()` and call `await event_manager.broadcast(event)`.

The characters module **does not currently publish events**. If a future feature needs to (e.g. "campaign DM gets notified when a player levels up"), add `domain/character_events.py` with the factory, make the relevant command async, inject `EventManager`. Don't roll a new event abstraction.

### 3.9 Backend — Cross-service (api-site ↔ api-game)

Game-session state in MongoDB is api-game's territory. [`GameService.update_player_character()`](api-game/gameservice.py#L347) holds a **denormalized snapshot** in `player_metadata[user_id]` containing: name, class, race, level, hp_current, hp_max, ac. Not the full character.

Direction of calls: **api-game → api-site via httpx** ([site_client.py](api-game/site_client.py)). api-site doesn't push to api-game; api-game pulls when a player joins / a session starts.

**Runtime sheet edits during a game session continue to PATCH api-site** ([`/api/characters/{id}/runtime`](api-site/modules/characters/api/endpoints.py#L391)). PostgreSQL is the canonical store. Any new runtime fields (spell slots, resource pool current values) follow this — they live in PostgreSQL, mutate via api-site, and are pulled into api-game's snapshot when a session reconciles. **No new WebSocket pipes from api-site.**

### 3.10 Frontend — TanStack Query hooks

Pattern from [hooks/useCharacterDraft.js](rollplay/app/(authenticated)/character/hooks/useCharacterDraft.js):
- One file per concern (`useCharacterDraft`, `useReferenceData`, `useSetCharacterAvatar`).
- One exported hook per query (`useCharacterDraft`, `useEditionSpecies`) or mutation (`useCreateDraft`, `useUpdateDraft`).
- All HTTP via `authFetch` + a local `call()` helper that throws on non-OK.
- Mutation `onSuccess` updates the cache via `queryClient.setQueryData([...], data)` for the entity, and `invalidateQueries` for list views.
- Reference data hooks use `staleTime: ONE_HOUR` — immutable per deploy.

**New character mutations extend [useCharacterDraft.js](rollplay/app/(authenticated)/character/hooks/useCharacterDraft.js).** New reference data queries extend [useReferenceData.js](rollplay/app/(authenticated)/character/hooks/useReferenceData.js). New files only for genuinely new concerns.

### 3.11 Frontend — Wizard step component shape

Every wizard step under [components/wizard/](rollplay/app/(authenticated)/character/components/wizard/) follows the same contract:
- Props: `{ draft, onSave, onBack, onNext }`.
- Loads its own reference data via hooks.
- Holds local state for in-progress editing, hydrating from the draft on mount.
- `onSave(payload)` is the parent's `persistStep(stepName, payload)` wrapper.
- [`StepFooter`](rollplay/app/(authenticated)/character/components/wizard/StepFooter.js) for back/next nav.
- Errors rendered inline above the footer.
- Optional tile-style picker pattern (`ExpandableTile`, `<Class|Species|Background>Tile`).

**New wizard steps follow this exact shape.** Sub-choices within a step render inline (like background's ability-distribution config). Don't introduce modal sub-flows unless the existing pattern can't host the UI.

### 3.12 Frontend — Two-tier styling

Per CLAUDE.md: `colorTheme.js` (Tier 1) + `constants.js` (Tier 2). New components consume `THEME.*` and `STYLES.*`; class panel headers use `PANEL_TITLE`/`PANEL_HEADER`/`PANEL_SUB_HEADER`/`PANEL_CHILD` from constants. **No new theme tokens unless an actual new semantic color is needed.**

### 3.13 What this plan will NOT invent

- ❌ A new "ChoiceGate" generic component (the previous draft proposed this — over-engineered). Each step's choice UI lives in that step, following existing tile/inline patterns. If a *render* pattern proves repeatable, refactor *later*, after two concrete steps exist.
- ❌ A new "rest_state" JSONB column on the character aggregate. The aggregate has typed fields; new per-rest data uses typed fields like the rest of the aggregate.
- ❌ A new event abstraction for runtime sheet changes. Existing PATCH endpoints already work; api-game pulls snapshots when needed.
- ❌ A new "resource pool" generic aggregate. Resources are typed fields on `CharacterAggregate` and translated like other join tables.
- ❌ Separate query endpoints for derived values. Everything derived goes in `DerivedStats` on the character response, computed by the strategy in `_build_derived_stats()`.
- ❌ A separate mapper file in the repository.
- ❌ Service locators, DI containers, or anything beyond FastAPI `Depends()`.
- ❌ New WebSocket pipes for character runtime sync.
- ❌ Pre-stringifying UUIDs in domain code (CLAUDE.md rule).

---

## 4. Edge case catalogue (unchanged from previous draft)

The exhaustive list of choices/calculations the SRD demands lives in [srd-edge-case-enumeration.md](srd-edge-case-enumeration.md) §1-18. Use that as the canonical reference. The mapping in §5 below links each edge case to the phase that delivers it.

For convenience, the master cheat-sheet of choices per level lives at [srd-edge-case-enumeration.md §16](srd-edge-case-enumeration.md). Subclass timing, swap cadences, and resource pools at §17.

---

## 5. Phase plan

Each phase below states: (a) what it delivers, (b) which existing files extend, (c) any new files (justified), (d) the pattern each new piece of code follows. **If a phase introduces a file not justified here, the implementation has drifted from the plan.**

### Phase A — Parser & registry data hardening

**Goal:** the parser extracts every structured datum the SRD encodes. JSON files become the rich source of choice metadata.

#### A.1 — Feat prerequisites

**Problem:** `feats.json` has `prerequisites: []` everywhere, even when the SRD line is `_General Feat (Prerequisite: Level 4+, Strength or Dexterity 13+)_`.

**Pattern fit:** the existing parser already has `_parse_prereq_line` regexes ([per audit](character-v2-current-state-audit.md#feat-prerequisites)). The data is dropped between extraction and emission — needs debugging.

**Extends:**
- [api-site/scripts/parse_srd.py](api-site/scripts/parse_srd.py) — fix the regex/emission so prereqs make it into the output.
- [api-site/shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add a `class_feature` variant to `FeatPrerequisite.type` Literal (for "Fighting Style Feature" prereqs).
- [api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py](api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py) — parametrized assertion: every feat whose description begins with `... (Prerequisite:` has non-empty `prerequisites`.

**No new files.**

#### A.2 — Subclasses

**Problem:** Each class section ends with one SRD subclass (Berserker, Champion, Life Domain, etc.) — parser stops at the first subclass heading. Dropped data.

**Pattern fit:** extend the existing per-class parser pass, emit new fields on existing `ClassDefinition`.

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add `SubclassDefinition`, `SubclassFeature` Pydantic models. Add `subclass_level: int` and `subclasses: list[SubclassDefinition]` to `ClassDefinition`.
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — extend the class parser to walk past the subclass H3 and extract its H4 features with their level numbers, plus any always-prepared spell tables.
- [seed_data/srd_5_2_1/classes.json](api-site/modules/characters/seed_data/srd_5_2_1/classes.json) — re-runs from parser, gains subclass fields.
- [registry.py](api-site/shared/rulesets/registry.py) — already loads `ClassDefinition` via `ClassesFile.model_validate(...)`; new fields propagate automatically. Add `get_subclass(edition_code, class_code, subclass_code) → SubclassDefinition` for convenience.
- [tests/seed_data/test_srd_5_2_1.py](api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py) — assert every class has at least one subclass; assert each subclass has features.

**No new files.**

#### A.3 — Structured choice metadata on class features

**Problem:** Class features that require a choice (Cleric's Divine Order, Fighter's Fighting Style, Sorcerer's Metamagic, Ranger's Hunter's Prey, Bard's Expertise picks, etc.) are stored as prose in `ClassLevel.features`. The wizard has no machine-readable way to know "Cleric L1 needs the player to pick Protector or Thaumaturge."

**Pattern fit:** add an optional `choices: list[ClassFeatureChoice]` field to the existing `ClassFeature` model. The model stays small and additive.

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py):
  ```python
  class ClassFeatureChoice(BaseModel):
      code: str = Field(pattern=CodePattern)            # "divine_order", "fighting_style", "hunters_prey", "metamagic", "expertise", ...
      name: str
      type: Literal[
          "single_pick",         # Divine Order, Hunter's Prey, Elemental Affinity, Blessed Strikes
          "feat_pick",           # Fighting Style: pick a feat from category 'fighting_style' (with Paladin/Ranger alternatives folded as extra options)
          "skill_proficiency",   # Primal Knowledge, Scholar, Expertise
          "weapon_mastery",      # Barbarian/Fighter/Paladin/Ranger/Rogue L1 weapon picks
          "metamagic",           # Sorcerer L2/L10/L17
          "invocation",          # Warlock invocations
          "spell_pick",          # Mystic Arcanum, Magical Secrets, Spell Mastery, Signature Spells
          "language",            # Rogue Thieves' Cant slot, Ranger Deft Explorer
          "tool_proficiency",    # Monk L1 Artisan-or-Instrument
      ]
      count: int = 1
      source: Optional[list[str]] = None                # allowed code list when applicable (skills/spells/etc.)
      options: list["ClassFeatureChoiceOption"] = []    # for single_pick types; each option may itself have nested choices
      swappable_on: Optional[Literal["long_rest", "short_or_long_rest", "level_up"]] = None

  class ClassFeature(BaseModel):
      name: str
      description: str
      choices: list[ClassFeatureChoice] = []            # NEW
  ```
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — per-class pass detects choice patterns from feature prose; emits structured `choices`. For features that are genuinely irregular (Brutal Strike's per-use effect list, Mystic Arcanum's level-keyed slots), accept that the parser can't cover every case — use a small **override file** per class, merged after parse:
  - New file pattern: `seed_data/srd_5_2_1/class_choice_overrides/<class_code>.json` — merged into the parsed class object before validation. **This is the one new file pattern this plan introduces** because the alternative (forcing the parser to handle every prose oddity) is fragile. Keep these files minimal — only for irregular constructs.

**Why this is not a new pattern:** override files for parser-irregular content are a standard escape hatch; we're not inventing a new abstraction, just reading more JSON into the same `ClassDefinition` shape.

#### A.4 — Species sub-choices

**Problem:** Dragonborn ancestry, Elven Lineage, Tiefling Legacy, Gnome Lineage, Goliath Ancestry, Human Skillful/Versatile, size choices — all in prose.

**Pattern fit:** mirror A.3 on `SpeciesDefinition`.

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add `SpeciesSubChoice` (same shape as `ClassFeatureChoice`, reused), add `sub_choices: list[SpeciesSubChoice] = []` to `SpeciesDefinition`. Add `leveled_grants_by_sub_choice: dict[str, dict[str, LeveledGrant]] = {}` for Elf/Tiefling L3+L5 spell pre-picks per lineage/legacy.
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — extend the species parser to walk traits, detect "Choose…" clauses, extract HTML tables (Draconic Ancestors, Elven Lineages, Fiendish Legacies, Giant Ancestries).
- [seed_data/srd_5_2_1/species.json](api-site/modules/characters/seed_data/srd_5_2_1/species.json) — re-runs, populated.

#### A.5 — Equipment as structured A/B/C choice

**Problem:** `starting_equipment_text` is free text. Backgrounds have A/B; Fighter has A/B/C.

**Pattern fit:** add typed Pydantic models; same parse-once pattern.

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add `EquipmentItem`, `EquipmentPackage`. Replace `starting_equipment_text` with `equipment_packages: list[EquipmentPackage]` on both `BackgroundDefinition` and `ClassDefinition`.
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — tokenise `_Choose A or B:_` clauses, split items.
- Re-run, validate per-package.

#### A.6 — Spellcasting tables per class

**Problem:** `class_specific: dict[str, str | int]` swallows spell-slot columns and cantrip-known columns as untyped values.

**Pattern fit:** lift typed sub-model; existing fields keep their place.

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add `SpellcasterProgression`, `PactSlot`. Add `spellcasting: Optional[SpellcasterProgression] = None` to `ClassDefinition`. Add `always_prepared_spells_by_level: dict[str, list[str]] = {}` to `SubclassDefinition`.
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — recognise spell-slot column groups in the progression HTML table, extract per-level dicts.
- Re-runs; validation tests assert structure.

#### A.7 — Eldritch Invocations catalogue

**Problem:** Warlock has ~30 invocations; not parsed.

**Pattern fit:** mirrors the existing feats parsing flow exactly. Same `FeatPrerequisite` shape reused (extended with one new variant: `pact_boon`).

**New file:**
- [seed_data/srd_5_2_1/invocations.json](api-site/modules/characters/seed_data/srd_5_2_1/invocations.json) — same envelope (`schema_version`, `edition`, `invocations: [...]`).

**Extends:**
- [shared/rulesets/models.py](api-site/shared/rulesets/models.py) — add `InvocationDefinition`, `InvocationsFile`. Add `pact_boon` variant to `FeatPrerequisite.type`.
- [scripts/parse_srd.py](api-site/scripts/parse_srd.py) — new per-section parser.
- [registry.py](api-site/shared/rulesets/registry.py) — register file loader; expose `list_invocations(edition_code)`, `get_invocation(edition_code, code)`.
- [api/edition_endpoints.py](api-site/modules/characters/api/edition_endpoints.py) — add `GET /api/editions/{edition_code}/invocations`.
- [tests/seed_data/test_srd_5_2_1.py](api-site/modules/characters/tests/seed_data/test_srd_5_2_1.py) — invocations file validation tests.

#### A.8 — Metamagic catalogue

**Problem:** Sorcerer's 10 Metamagic options listed inline in class section, not extracted.

**Pattern fit:** same as A.7.

**New file:**
- [seed_data/srd_5_2_1/metamagic.json](api-site/modules/characters/seed_data/srd_5_2_1/metamagic.json).

**Extends:** models, parser, registry, edition_endpoints (`GET /editions/{code}/metamagic`), tests — mirror A.7.

#### A.9 — Weapon catalogue

**Problem:** Weapon Mastery requires picking N weapons; weapons aren't in JSON.

**Pattern fit:** same as A.7. Includes armor table too (used by AC math in C.4).

**New files:**
- [seed_data/srd_5_2_1/weapons.json](api-site/modules/characters/seed_data/srd_5_2_1/weapons.json)
- [seed_data/srd_5_2_1/armor.json](api-site/modules/characters/seed_data/srd_5_2_1/armor.json) — Light/Medium/Heavy with base AC and DEX caps.

**Extends:** models (`WeaponDefinition`, `ArmorDefinition`), parser (Equipment section pp.89-92), registry, edition_endpoints, tests.

#### A.10 — Spell content

**Problem:** No spells parsed. Largest single job.

**Pattern fit:** same as A.7 — one new file, content type, registry load.

**New file:**
- [seed_data/srd_5_2_1/spells.json](api-site/modules/characters/seed_data/srd_5_2_1/spells.json).

**Extends:** models (`SpellDefinition`, `SpellsFile`), parser (extensive — see below), registry (`get_spell`, `list_spells_by_class`, `list_cantrips_by_class`), edition_endpoints (`GET /editions/{code}/spells?class=wizard&level=3`), tests.

**Recommend as standalone PR** — large surface area, easier to review on its own. If the parser proves brittle on edge cases, hybrid approach: parser handles regular shape, hand-author overrides for ~5-10 odd ones.

#### A.11 — Beast catalogue (Druid Wild Shape)

Defer until Druid Wild Shape UI is in scope. Same pattern when needed.

### Phase B — Domain aggregate expansion

**Goal:** the aggregate has typed fields for every new piece of character state. Each follows the existing value-object + repository-sync pattern.

#### B.1 — Subclass tracking

**Pattern fit:** new value object on the aggregate, new ORM table, repository extension. Mirrors `ClassEntry` exactly.

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py):
  ```python
  @dataclass(frozen=True)
  class SubclassEntry:
      class_code: str
      subclass_code: str
      chosen_at_level: int
  ```
  Add `subclasses: list[SubclassEntry]` field. Add `pick_subclass(class_code, subclass_code)` method (validates against ruleset).
- New file: [model/character_subclass_model.py](api-site/modules/characters/model/character_subclass_model.py) — mirrors [character_class_model.py](api-site/modules/characters/model/character_class_model.py) (`character_subclasses` table).
- [repositories/character_repository.py](api-site/modules/characters/repositories/character_repository.py) — add `subclass_entries` to `selectinload`, translation block, delete-and-rewrite block.
- [api/schemas.py](api-site/modules/characters/api/schemas.py) — add `SubclassEntryDTO`, append to `CharacterResponse`.
- [alembic/env.py](api-site/alembic/env.py) — import the new model. Generate migration via `alembic revision --autogenerate`.

#### B.2 — Spell selections

**Pattern fit:** same as B.1. Two ORM tables: spell selections (the picks) and spell-slot state (consumption tracking).

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py):
  ```python
  @dataclass(frozen=True)
  class SpellSelection:
      spell_code: str
      spell_level: int  # 0 for cantrips
      source: str       # "class_known", "class_prepared", "spellbook", "always_prepared", "mystic_arcanum", "magic_initiate", "species", "magical_secrets"
      granted_by: str   # "wizard", "warlock_subclass_fiend", "tiefling_infernal", "feat_magic_initiate"
      casting_ability: str
  ```
  Constants:
  ```python
  SPELL_SOURCES: frozenset[str] = frozenset({
      "class_known", "class_prepared", "spellbook", "always_prepared",
      "mystic_arcanum", "magic_initiate", "species", "magical_secrets",
  })
  ```
  Add `spells: list[SpellSelection]`. Add `spell_slot_uses: dict[int, int]` (current uses per spell level). Add `pact_slot_uses: dict[int, int]`. Add methods: `learn_spell(...)`, `forget_spell(...)`, `consume_slot(level)`, `restore_slot(level)`, `restore_short_rest()`, `restore_long_rest()`.
- New file: [model/character_spell_model.py](api-site/modules/characters/model/character_spell_model.py) — table `character_spells`.
- New file: [model/character_spell_slot_state_model.py](api-site/modules/characters/model/character_spell_slot_state_model.py) — table `character_spell_slot_state` (one row per (character, slot_level)).
- [repositories/character_repository.py](api-site/modules/characters/repositories/character_repository.py) — same extension pattern as B.1, for both tables.
- [api/schemas.py](api-site/modules/characters/api/schemas.py) — add `SpellSelectionDTO`, expose on `CharacterResponse`. Add `spell_slot_uses: Dict[int, int]`, `pact_slot_uses: Dict[int, int]`.
- Alembic migration.

#### B.3 — Resource pools

**Pattern fit:** same as B.1. Typed resources on the aggregate, one ORM table, one DTO.

Why not a generic "ResourcePool" with `pool_code`? Because the codebase already prefers **typed fields per concern** (`hp_max`, `hp_current`, `hp_temp`, `xp` are all separate typed ints on the aggregate, not a `vitals_dict`). Following that pattern:

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py):
  ```python
  @dataclass(frozen=True)
  class ResourceUsage:
      pool_code: str       # "rage", "sorcery_points", "channel_divinity", "wild_shape", "second_wind", "action_surge", "lay_on_hands_hp", "monk_focus", "bardic_inspiration", "indomitable", "hunters_mark_free_casts"
      current_value: int   # current uses
      # max comes from the ruleset, computed on read
  ```
  Add `resource_usage: list[ResourceUsage]`. Methods: `consume_resource(pool_code, amount=1)`, `restore_resource(pool_code, amount=None)`, `restore_short_rest()`, `restore_long_rest()` (these last two iterate resources and consult ruleset for recharge timing).
- New file: [model/character_resource_model.py](api-site/modules/characters/model/character_resource_model.py) — table `character_resource_usage`.
- Repository extension + schema extension + migration.

Strategy method [`compute_resource_pools(character) → dict[str, int]`](#C.4) returns `{pool_code: max_value}`. The DTO joins this with the aggregate's current values to expose `{pool_code, max_value, current_value, recharge}` per pool.

#### B.4 — Invocations, Metamagic, Pact Boon, Mystic Arcanum

**Pattern fit:** simple list-of-codes fields on the aggregate. No new tables — these fit cleanly as nullable columns on `characters` or as small join tables; choose join tables for the count-many fields, single columns for singletons.

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py):
  - `invocations: list[str]` — list of invocation codes.
  - `metamagic: list[str]` — list of metamagic codes.
  - `pact_boon: Optional[str]` — convenience field (also present in `invocations`).
  - Mystic Arcanum spells already covered by `SpellSelection` with `source="mystic_arcanum"`.
  Methods: `learn_invocation`, `swap_invocation`, `learn_metamagic`, `swap_metamagic`, `set_pact_boon`.
- New files: [model/character_invocation_model.py](api-site/modules/characters/model/character_invocation_model.py), [model/character_metamagic_model.py](api-site/modules/characters/model/character_metamagic_model.py) — small join tables.
- `pact_boon` is a new nullable column on the existing `characters` table.
- Repository + schema + migration.

#### B.5 — Sub-flavour storage

**Problem:** Magic Initiate spell list pick (Cleric/Druid/Wizard), Elemental Affinity damage type, Hunter's Prey effect, Fiendish Resilience damage type, Dragonborn ancestry, Elf lineage, etc.

**Pattern fit:** these are choices that belong to specific value objects (feat acquisition, species, class entry). Extend the value objects with optional sub-choice fields. Don't create a generic "sub_choices dict" on the aggregate.

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py):
  - `FeatAcquisition` gains `sub_choices: dict[str, str] = field(default_factory=dict)` — for Magic Initiate's `{"spell_list": "cleric", "spellcasting_ability": "wisdom"}`.
  - `ClassEntry` gains `sub_choices: dict[str, Any] = field(default_factory=dict)` — for `{"divine_order": "thaumaturge", "fighting_style": "defense", "weapon_mastery_codes": ["longsword","shortbow"]}`. (Loosely typed because choices vary per class.)
  - New field on aggregate: `species_sub_choices: dict[str, str | list[str]]` — for `{"draconic_ancestor": "bronze", "elf_lineage": "high_elf", "tiefling_legacy": "infernal"}`. Single JSONB column on the `characters` table.
  - `SubclassEntry` gains `sub_choices: dict[str, Any]` — for `{"elemental_affinity_damage": "fire"}` (Draconic Sorcerer L6).

These reuse the existing JSONB-on-aggregate pattern from `ability_roll_details` ([character_model.py line for ability_roll_details](api-site/modules/characters/model/character_model.py)).

**Per-rest swap state (Hunter's Prey, Fiendish Resilience, Wild Shape forms, Weapon Mastery swaps) is part of `ClassEntry.sub_choices` or `SubclassEntry.sub_choices`.** No separate "rest_state" column.

#### B.6 — HP recompute on CON change

**Pattern fit:** the aggregate already has `apply_asi` which mutates ability scores. Extend it to call `_recompute_hp_for_constitution_change()` when CON changes. The recompute logic delegates to the ruleset.

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py) — `apply_asi(increases, *, ruleset)` now takes a ruleset parameter; when CON modifier delta != 0, call `self.hp_max = ruleset.compute_hp_max(self)` and adjust `hp_current` proportionally.
- [shared/rulesets/dnd_2024.py](api-site/shared/rulesets/dnd_2024.py) — see C.3.

### Phase C — Ruleset strategy expansion

**Goal:** all derived calculations exposed via `RulesetStrategy` methods, surfaced through `DerivedStats`.

#### C.1 — Feat eligibility

**Extends:**
- [shared/rulesets/strategy.py](api-site/shared/rulesets/strategy.py) — new abstract methods `is_feat_available(character, feat) → bool` and `list_available_feats(character, category=None) → list[FeatDefinition]`.
- [shared/rulesets/dnd_2024.py](api-site/shared/rulesets/dnd_2024.py) — implementation walks `feat.prerequisites`, checks each variant against character state. Also handles `repeatable=False` blocking already-taken feats.
- [api/endpoints.py](api-site/modules/characters/api/endpoints.py) — `preview_level_up` populates `qualifying_feats` via the strategy (replacing today's unfiltered list at [line 454](api-site/modules/characters/api/endpoints.py#L454)).

#### C.2 — Multiclass spell slots & cantrips

**Extends:**
- Strategy ABC + impl — `compute_spell_slots(character) → dict[int, int]` (per multiclass spellcaster table), `compute_pact_slots(character) → Optional[PactSlot]`.
- [api/schemas.py](api-site/modules/characters/api/schemas.py) — `DerivedStats` gains `spell_slots: Dict[int, int]`, `pact_slots: Optional[PactSlotDTO]`, `spell_save_dc_by_ability: Dict[AbilityCode, int]`, `spell_attack_bonus_by_ability: Dict[AbilityCode, int]`.
- [api/endpoints.py:_build_derived_stats](api-site/modules/characters/api/endpoints.py#L69) — populate the new fields.

`_MULTICLASS_SLOTS` is a module-level constant in `dnd_2024.py`, same pattern as `_XP_THRESHOLDS`.

#### C.3 — HP recompute

**Extends:**
- Strategy — `compute_hp_max(character) → int` (per [SRD HP rules in srd-edge-case-enumeration §3](srd-edge-case-enumeration.md)). Walks `class_entries` in order, applies L1-of-first-class max hit die rule, sums per-level values (looked up from the choices log if recorded, else average), adds CON × level, applies Dwarven Toughness / Draconic Resilience / Tough feat retroactives.
- `level_up_hp_options` continues to exist; HP recompute is the broader case for ASI-driven CON bumps.

#### C.4 — AC method enumeration + resource pool maxes

**Extends:**
- Strategy — `list_ac_methods(character) → list[ACMethodDTO]`, `compute_resource_pools(character) → dict[str, int]` (returns `{pool_code: max_value}`).
- AC: surfaces in `DerivedStats.ac_methods`. The aggregate stores `active_ac_method: Optional[str]` (new field, mirrored to ORM); strategy ensures the selected method is in the available list, falls back to base if invalid.
- Resource pools: `_build_derived_stats` joins the strategy's `{pool_code: max}` with the aggregate's `resource_usage` (current values) and `RecurDef` (recharge per pool from class metadata).

#### C.5 — Subclass eligibility

**Extends:**
- Strategy — `can_pick_subclass(character, class_code) → bool`. Checks the class's `subclass_level` against the character's level in that class.

#### C.6 — Multiclass primary ability prereq

**Extends:**
- Strategy — `can_add_class(character, class_code) → bool` per [SRD p.24](srd-edge-case-enumeration.md). Uses `ClassDefinition.primary_ability` (which may need to be `AbilityCode | list[AbilityCode]` — schema update in A.2 area).

### Phase D — Validation in commands

**Goal:** every invariant from the edge case catalogue enforced in commands, raising `ValueError` per the existing pattern.

#### D.1 — Aggregate invariants in step handlers

**Extends:**
- [application/commands.py — UpdateCharacterDraft handlers](api-site/modules/characters/application/commands.py#L99-L260) — extend per-step validation:
  - `_apply_ability_scores` enforces cap 20 at creation (already does, see [line 211 schema constraint](api-site/modules/characters/api/schemas.py#L211)).
  - `_apply_class` (new sub-validations): all required L1 class choices made, no Expertise duplicates, Fighting Style picked for Fighter/Paladin/Ranger if at appropriate level.
  - `_apply_background` (existing) keeps duplicate-skill soft-skip; warn surfaces on the response (new field `warnings: list[str]` on `CharacterResponse`).
  - `_apply_subclass` (new handler) — validates eligibility via ruleset.
  - `_apply_spells` (new handler) — validates spells against class's allowed list and level cap.

#### D.2 — Multiclass entry prereq

**Extends:**
- New step in `UpdateCharacterDraft`: `add_class` — validates ability prereq via strategy (C.6) before mutating. Mirrors how `_apply_class` works today, but for adding rather than replacing.

### Phase E — Wizard restructure (frontend)

**Goal:** the wizard walks the player through every choice. Starting level becomes a first-class concept.

#### E.1 — Starting level + class-distribution as wizard steps

**Pattern fit:** mirrors the existing wizard step contract ([§3.11](#311-frontend--wizard-step-component-shape)).

**Extends:**
- [components/CharacterWizard.js](rollplay/app/(authenticated)/character/components/CharacterWizard.js) — extend the `STEPS` array. For `starting_level > 1`, insert a `ClassDistributionStep` after class.
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py) — add `starting_level: int` field (default 1).
- [api/schemas.py](api-site/modules/characters/api/schemas.py) — extend `StepName` literal with `"starting_level"`; new `StartingLevelStepPayload`; new `UpdateCharacterDraft._apply_starting_level` handler.
- New wizard step files (follow existing pattern):
  - [components/wizard/StartingLevelStep.js](rollplay/app/(authenticated)/character/components/wizard/StartingLevelStep.js) — number input + brief explainer.
  - [components/wizard/ClassDistributionStep.js](rollplay/app/(authenticated)/character/components/wizard/ClassDistributionStep.js) — extends the existing ClassStep visual pattern; lets the player distribute `starting_level` across classes.

#### E.2 — Per-class-level "advancement choices" sub-step (for starting-level > 1)

For any starting level > 1, after class distribution the wizard walks the player through each level's choices (HP, ASI/feat at ASI levels, subclass at subclass level, etc.).

**Pattern fit:** keep this inside the existing wizard step pattern. Each "advancement card" is rendered by [components/wizard/AdvancementStep.js](rollplay/app/(authenticated)/character/components/wizard/AdvancementStep.js) — one wizard step that internally paginates through `[class, level]` combinations.

Each per-level card is a sub-component dispatched by the type of choice needed:
- HP card → `HpChoiceCard.js`
- ASI card → `AsiChoiceCard.js`
- Subclass card → `SubclassChoiceCard.js`
- Class-feature-choice card → renders per feature type (e.g. `FightingStyleCard.js`, `MetamagicCard.js`, `InvocationCard.js`)

**Why not a generic ChoiceGate:** the previous draft proposed one. We're not introducing it. Each card is a small component with its own UI tailored to the choice; if a render pattern repeats we refactor *after* it appears twice, not before. The existing codebase's instinct (tile-based pickers, inline panels) is the right one — let it grow naturally.

#### E.3 — Species sub-choice handling (within SpeciesStep)

**Extends:**
- [components/wizard/SpeciesStep.js](rollplay/app/(authenticated)/character/components/wizard/SpeciesStep.js) — when a species is picked, the existing post-pick panel grows new inline sub-pickers (lineage, ancestry, etc.) keyed off `species.sub_choices` from the registry. Pattern: same as the existing language picker at [line 43](rollplay/app/(authenticated)/character/components/wizard/SpeciesStep.js#L43), driven by `language_choices.count`.

#### E.4 — Background sub-choices

**Extends:**
- [components/wizard/BackgroundStep.js](rollplay/app/(authenticated)/character/components/wizard/BackgroundStep.js) — add equipment package picker (A/B tiles below the existing ability bonus picker). Add Magic Initiate sub-flavour picker for Acolyte/Sage (cantrip and spell pickers, driven by the registry spell list filtered by `spell_list` parameter).
- [components/wizard/BackgroundTile.js](rollplay/app/(authenticated)/character/components/wizard/BackgroundTile.js) — existing tile gains a new "selected mode" section for these sub-choices, similar to today's ability-distribution UI ([BackgroundStep.js:144](rollplay/app/(authenticated)/character/components/wizard/BackgroundStep.js#L144)).

#### E.5 — Class L1 feature pickers (within ClassStep)

**Extends:**
- [components/wizard/ClassStep.js](rollplay/app/(authenticated)/character/components/wizard/ClassStep.js) — after picking a class+level, render inline pickers for L1 choices driven by `class.features_by_level["1"][*].choices` from the registry. Each choice type has a small sub-renderer in the same file (or extracted only if size warrants).

For the wizard at starting_level=1, all class L1 choices fire here. For starting_level > 1, the AdvancementStep (E.2) handles per-level cards instead.

#### E.6 — Spell selection

**New wizard step:** [components/wizard/SpellsStep.js](rollplay/app/(authenticated)/character/components/wizard/SpellsStep.js) — only rendered if any chosen class has spellcasting. Lists cantrips and spell picks per class, with the registry providing the filtered list.

For multi-class spellcasters, the step paginates per spellcasting class.

#### E.7 — Frontend hooks for new reference data

**Extends:**
- [hooks/useReferenceData.js](rollplay/app/(authenticated)/character/hooks/useReferenceData.js) — add `useEditionInvocations`, `useEditionMetamagic`, `useEditionSpells(editionCode, classCode?, level?)`, `useEditionWeapons`, `useEditionArmor`. All follow the existing `useEditionX` pattern: `useQuery` with `ONE_HOUR` stale time, gated by `enabled: Boolean(editionCode)`.

#### E.8 — Frontend hooks for new draft sub-resources

**Extends:**
- [hooks/useCharacterDraft.js](rollplay/app/(authenticated)/character/hooks/useCharacterDraft.js) — no new files. The existing `useUpdateDraft` already handles arbitrary step payloads via the dispatch. New steps (`starting_level`, `add_class`, `subclass`, `spells`, `advancement`) flow through it unchanged.

### Phase F — Level-up modal expansion

**Goal:** the level-up modal walks the player through every choice the new level unlocks. Single modal, dynamic steps driven by the preview.

#### F.1 — Dynamic step list from preview

**Extends:**
- [api/schemas.py — LevelUpPreview](api-site/modules/characters/api/schemas.py#L275) — expand the preview to include subclass-eligibility, spell-choice needs, feature-choice list, qualifying invocations/metamagic-additions, etc. Pattern: the preview is the contract for what the modal needs to render.
- [api/endpoints.py — preview_level_up](api-site/modules/characters/api/endpoints.py#L421) — extended logic to populate the new preview fields via ruleset and registry calls.
- [application/commands.py — LevelUpCharacter.execute](api-site/modules/characters/application/commands.py#L447) — extend the kwarg list to accept new choice payloads (`subclass_choice`, `spell_choices`, `feature_choices`, `invocation_choice`, etc.) and dispatch to aggregate methods. Each new branch writes its own audit log entry per existing pattern ([line 530](api-site/modules/characters/application/commands.py#L530)).
- [components/LevelUpModal.js](rollplay/app/game/components/LevelUpModal.js) — extend the existing `STEPS` array to include subclass / spell / feature steps, all dynamic from `preview`.
- [api/schemas.py — LevelUpRequest](api-site/modules/characters/api/schemas.py#L294) — extend with new optional payloads.

**No new command class.** `LevelUpCharacter` already orchestrates multi-stage choices ([HP → ASI/feat → skills](api-site/modules/characters/application/commands.py#L447-L562)); we extend the same orchestration.

#### F.2 — Feat picker with descriptions + prereq filter

**Extends:**
- [components/LevelUpModal.js](rollplay/app/game/components/LevelUpModal.js) — the existing feat dropdown loads from the (now-filtered) `qualifying_feats`. Render a side panel or expandable row for each feat showing description (fetched via the already-cached `useEditionFeats` hook). No new endpoint — the feat data is already on the registry response.

### Phase G — Runtime sheet

**Goal:** the in-game character sheet shows everything and lets the player edit live state.

#### G.1 — Resource pool / spell slot UI

**Pattern fit:** the runtime sheet currently displays via [CharacterSheet.js](rollplay/app/game/components/CharacterSheet.js). Extend it with new sections; each section is a typed UI element rendered conditionally on whether the character has that resource.

**Extends:**
- [components/CharacterSheet.js](rollplay/app/game/components/CharacterSheet.js) — new sections for spell slots, pact slots, resource pools, prepared spells, invocations. All read from `CharacterResponse.derived` and `CharacterResponse.resource_usage` / `spell_slot_uses` / etc.
- [api/schemas.py — RuntimePatchRequest](api-site/modules/characters/api/schemas.py#L256) — extend to accept partial updates of resource_usage and spell_slot_uses.
- [application/commands.py — UpdateRuntimeState](api-site/modules/characters/application/commands.py#L374) — extend the per-field handler dispatch (already pattern-matches updates dict; one new field per resource type).

**No new endpoint.** PATCH `/api/characters/{id}/runtime` is the single edit surface for live state.

#### G.2 — Per-rest swap state UI

Per-rest swappable choices (Wild Shape forms, Hunter's Prey, Fiendish Resilience damage type, prepared spells, Weapon Mastery weapons) appear as small dropdowns/pickers in CharacterSheet. They write to the relevant aggregate fields (`class_entries[].sub_choices`, `subclasses[].sub_choices`, `spells`) via the same runtime PATCH endpoint.

#### G.3 — Conditions + exhaustion

**Extends:**
- [domain/character_aggregate.py](api-site/modules/characters/domain/character_aggregate.py) — `status_effects: list[str]` becomes typed: `conditions: list[str]` (validated against an enum from [shared/rulesets/conditions.py](api-site/shared/rulesets/conditions.py) — new tiny file holding the SRD condition list as a constant) + `exhaustion_level: int = 0`.
- ORM model and DTO updated; migration generated.
- CharacterSheet renders typed condition badges with tooltips (description from the registry).

### Phase H — DM party view

Implements the original v2's deferred Phase 5.

**Extends:**
- [api/endpoints.py](api-site/modules/characters/api/endpoints.py) — `GET /api/campaigns/{campaign_id}/party` returns finalised characters with `active_in_campaign_id == campaign_id`. Auth: requester must be DM of the campaign OR a player in the campaign.
- [application/queries.py](api-site/modules/characters/application/queries.py) — new `GetCampaignParty` query (follows existing query pattern).
- Frontend: new game-session tab; reuses CharacterSheet with `readOnly={true}`.

### Phase I — api-game snapshot sync

**Goal:** when a player's character changes meaningfully (level-up, spell consumption that flows back to PostgreSQL, etc.), api-game's `player_metadata` snapshot stays in sync.

**Pattern fit:** the existing pull-from-api-site direction. Don't push from api-site.

**Extends:**
- [api-game/site_client.py](api-game/site_client.py) — add a `fetch_character_summary(character_id)` helper that calls `GET /api/characters/{id}` and reduces to the snapshot fields.
- [api-game/gameservice.py — update_player_character](api-game/gameservice.py#L347) — already extensible; called from existing seat-update flows. New trigger: when the runtime sheet PATCH endpoint mutates HP/level/AC, api-game refetches on its next WebSocket-driven seat update. No proactive push.

**No new WebSocket pipe.** No new shared service. The existing pull-on-demand pattern handles this.

---

## 6. Per-class playbook (cross-reference)

Same as the previous draft — use [§6 in the previous draft](#) as the per-class completeness checklist. Reproduced here for convenience:

| Class | Subclass | L1 sub-choices | Spellcasting | Per-rest state | Resource pools | ASI tiers |
|-------|----------|----------------|--------------|----------------|----------------|-----------|
| Barbarian | Path of the Berserker | Weapon Mastery ×2 | none | Weapon Mastery swap | Rage uses | 4,8,12,16 |
| Bard | College of Lore | Cantrips ×2, Prepared ×4, Instruments ×3 | full | Bard prepared swap (level-up) | Bardic Inspiration | 4,8,12,16 |
| Cleric | Life Domain | Cantrips ×3, Prepared ×4, Divine Order | full | Cleric prepared swap (Long Rest) | Channel Divinity | 4,8,12,16 |
| Druid | Circle of the Land | Cantrips ×2, Prepared ×4, Primal Order, Wild Shape forms ×4, Land | full | Wild Shape forms, Land, prepared swap | Wild Shape uses | 4,8,12,16 |
| Fighter | Champion | Fighting Style, Weapon Mastery ×3 | none | Weapon Mastery swap | Second Wind, Action Surge, Indomitable | 4,6,8,12,14,16 |
| Monk | Warrior of the Open Hand | Tool choice | none | — | Focus Points | 4,8,12,16 |
| Paladin | Oath of Devotion | Prepared ×2, Weapon Mastery ×2 | half (Spellcasting L1) | Paladin prepared swap | Lay on Hands HP, Channel Divinity | 4,8,12,16 |
| Ranger | Hunter | Prepared ×2, Weapon Mastery ×2 | half (Spellcasting L1) | Ranger prepared swap, Hunter's Prey, Defensive Tactics | Hunter's Mark casts | 4,8,12,16 |
| Rogue | Thief | Expertise ×2, Thieves' Cant language, Weapon Mastery ×2 | none | Weapon Mastery swap | — | 4,8,10,12,16 |
| Sorcerer | Draconic Sorcery | Cantrips ×4, Prepared ×2 | full | Sorcerer prepared swap (level-up); Elemental Affinity is static | Sorcery Points | 4,8,12,16 |
| Warlock | Fiend Patron | Cantrips ×2, Prepared ×2, Invocation ×1 | pact (short-rest slots) | Fiendish Resilience, Tome cantrips, prepared swap | Pact slots, Mystic Arcanum | 4,8,12,16 |
| Wizard | Evoker | Cantrips ×3, Spellbook ×6, Prepared ×4 | full | Wizard prepared swap, cantrip swap (Long Rest), Memorize Spell (Short Rest L5+), Spell Mastery (Long Rest L18+) | — | 4,8,12,16 |

---

## 7. Pattern compliance checklist (per PR)

Every PR opened against this plan must satisfy this checklist (paste into the PR description):

- [ ] **CQRS.** New writes are new step handlers on `UpdateCharacterDraft` / new branches in `LevelUpCharacter`, or a new top-level command class only if a distinct lifecycle is involved. New reads are new query classes in `queries.py` only if reused outside the single endpoint.
- [ ] **Aggregate.** New state is typed fields + frozen value objects + methods on `CharacterAggregate`. Methods call `self._touch()`. No ORM imports.
- [ ] **Repository.** New join tables added to `_query().options(selectinload(...))`, `_model_to_aggregate`, the delete-and-rewrite block in `save`, and `_write_all_children`. No new mapper file.
- [ ] **Models.** New SRD content types in `shared/rulesets/models.py`. New API DTOs in `modules/characters/api/schemas.py`. Reference endpoints return rules models directly.
- [ ] **Endpoints.** New endpoints extend `endpoints.py` / `edition_endpoints.py`. Each is ≤15 lines: `Depends()` → command/query → `_to_character_response(...)`.
- [ ] **Strategy.** Derived calculations are methods on `RulesetStrategy` ABC + `Dnd2024Ruleset`. Static tables as module-level constants. Surfaced via `DerivedStats` on the response.
- [ ] **DI.** Any new dependency added to `dependencies/providers.py` with a `get_X` factory. No service locators.
- [ ] **Events.** No events introduced unless explicitly required; if so, follow the `EventConfig` factory pattern from CLAUDE.md.
- [ ] **Frontend hooks.** New TanStack hooks extend `useCharacterDraft.js` or `useReferenceData.js`. New files only for genuinely new concerns (e.g. `useSpellbook.js` if spellbook UI grows to need its own hooks).
- [ ] **Wizard steps.** New steps under `components/wizard/` follow `{draft, onSave, onBack, onNext}` props, use `StepFooter`, hydrate local state from `draft` on mount.
- [ ] **Styling.** Use `THEME`, `STYLES`, and the panel-tier constants. No new theme tokens unless a new semantic colour is needed.
- [ ] **api-game.** No new push from api-site to api-game. api-game pulls via `site_client.py` when needed.
- [ ] **Migrations.** Generated via `alembic revision --autogenerate` in Docker. Models imported in `alembic/env.py`.
- [ ] **UUIDs.** Pass `UUID` objects internally; stringify only at serialization boundaries (per CLAUDE.md).

---

## 8. Recommended PR sequence

Each PR is sized to be reviewable on its own and to ship value incrementally.

| PR | Phases | Scope | Approx size |
|----|--------|-------|-------------|
| **PR 1** | A.1 | Fix feat prereq parsing + add validation tests + use in `preview_level_up` filter. Small, immediate UX win. | S |
| **PR 2** | A.5 + E.4 | Equipment as A/B/C structured choice, with picker UI in BackgroundStep. | S |
| **PR 3** | A.2 + A.3 + A.4 | Subclasses + class L1 choice metadata + species sub-choices in registry. Pure data — no UI yet. | M |
| **PR 4** | B.1 + B.5 + Phase D partial + E.3 + E.5 | Subclass tracking on aggregate + sub-flavour storage + species sub-choices in wizard + class L1 pickers in ClassStep. | M |
| **PR 5** | A.6 + A.10 | Spellcasting tables + spell content. **Large; standalone PR.** | XL |
| **PR 6** | A.7 + A.8 | Invocations + Metamagic catalogues. | S |
| **PR 7** | B.2 + B.4 + C.2 + C.6 + E.6 + F.1 (spell parts) | Spell selections on aggregate, multiclass spell slots in strategy, SpellsStep in wizard, spell pickers in LevelUpModal. | L |
| **PR 8** | A.9 + B.3 + C.4 (resource pools + AC parts) + G.1 | Weapon catalogue + resource pools on aggregate + AC method enumeration + runtime sheet resource/slot UI. | M |
| **PR 9** | B.6 + C.3 + C.5 + Phase D rest | HP recompute on CON change + subclass eligibility + remaining validation tightening. | S |
| **PR 10** | E.1 + E.2 | Starting level + class distribution + AdvancementStep. | M |
| **PR 11** | F.1 (rest) + F.2 | LevelUpModal expansion (subclass step, feature steps, feat description+filter). | M |
| **PR 12** | G.2 + G.3 + Phase H | Per-rest swap UI + conditions/exhaustion + DM party view. | M |
| **PR 13** | Phase I | api-game snapshot sync extension. | S |

Total: ~13 PRs. Quick wins (PR 1, PR 2, PR 6) ship immediately. Phase A.10 (spells) is the elephant — recommend running it in a long-lived branch with mid-flight reviews on the parser before integrating.

---

## 9. Acceptance criteria

The character v2 system is complete when:

1. Every choice in [srd-edge-case-enumeration.md §16/§18](srd-edge-case-enumeration.md) can be made via the UI; the wizard/level-up modal never silently advances past a choice the SRD demands.
2. The parser's parametrized tests cover prerequisites, sub-choices, spellcasting tables, invocations, metamagic, weapons, spells — and pass against the committed JSON.
3. A character can be created at any starting level 1-20 without manual intervention; the wizard walks every level's choices.
4. A multi-class character can be created and levelled without any single-class assumption tripping up the flow.
5. A spellcaster has all their spells, slots, cantrips, always-prepared rendered correctly and editable per the rules.
6. All resource pools appear on the runtime sheet with correct max values and recovery on rest.
7. All per-rest mutable choices appear on the runtime sheet and can be swapped at the right cadence.
8. The DM can view a read-only party panel showing every party member's sheet.
9. **Every PR has the §7 pattern compliance checklist ticked.**

When all nine are true, the system is RAW-faithful for the SRD's content, ready for use at table, and architecturally consistent with the rest of the codebase.

---

*End of plan. The [SRD edge case enumeration](srd-edge-case-enumeration.md) is the source-of-truth for SRD rules. The [current-state audit](character-v2-current-state-audit.md) is the source-of-truth for "what's already there." This plan is the bridge.*
