# Debrief: Shared Contracts Package + Anti-Corruption Layer

**Plan file:** `.claude-plans/DONEshared-contracts-acl.md`
**Branches:** `shared-contracts-PR-1` (PR #84), `shared-contracts-PR-2` (PR #85), `shared-contracts-pr3` (PR #83)
**Period:** 2026-03-09 → 2026-03-10
**Status:** All 3 PRs complete — package, api-game ACL, api-site ACL + tech debt resolution

---

## 1. Goals Set

- **PR 1:** Create pip-installable shared contracts package with all boundary schemas, wire into Docker services (dev + prod), add contract tests (round-trip, shape conformance, constraint validation), set up GitHub Actions CI. Zero service code changes.
- **PR 2:** Replace api-game's local `session_schemas.py` with contract imports. Add Pydantic validation at HTTP endpoints and WebSocket handlers. Extract DRY `_room_filter()` helper in GameService. Delete `session_schemas.py`.
- **PR 3:** api-site session commands use typed payloads (`SessionStartPayload`, `SessionEndResponse`). Library aggregates return contract types from `build_*_for_game()` methods. Tech debt items #4/#6/#8/#9/#10 resolved.

---

## 2. What Was Delivered

### PR 1: Package, Tests, Docker, CI

**Package (`rollplay-shared-contracts/`):**
- `pyproject.toml` — package metadata
- `shared_contracts/__init__.py` — re-exports all types
- 6 schema modules: `audio.py` (AudioEffects, AudioChannelState, AudioTrackConfig), `display.py` (ActiveDisplayType), `assets.py` (AssetRef), `map.py` (GridColorMode, GridConfig, MapConfig), `image.py` (ImageConfig), `session.py` (PlayerState, SessionStats, SessionStartPayload, SessionEndFinalState, SessionStartResponse, SessionEndResponse)

**Contract Tests (`rollplay-shared-contracts/tests/test_contracts.py`):**
- 30 tests across 3 categories: round-trip (13), shape conformance (7), constraint validation (10)

**Docker Wiring:**
- `.dockerignore` — prevents sending frontend/git/plans to Docker build context
- `docker-compose.dev.yml` + `docker-compose.yml` — build context widened to repo root
- All 4 Dockerfiles updated (dev + prod for api-game + api-site)
- Dev: editable install (`-e`) with volume mounts for hot-reload
- Prod: non-editable install with optimised layer ordering

**CI (`.github/workflows/`):**
- `contracts.yml` — 2-job pipeline: shell-based coverage check → pytest
- `api-site.yml` — runs api-site pytest on changes to `api-site/` or `rollplay-shared-contracts/`

**Test Infrastructure Fixes (unplanned but necessary):**
- `conftest.py` — test env vars, JSONB/ARRAY SQLite patches, FriendCode model import, mock_event_manager fixture, create_character multi-class support, create_friendship async handling
- `test_friendship_flow.py` — updated for async commands + renamed parameters
- `test_campaign_with_session.py` — updated session name assertions
- `test_character_session_joining.py` — deleted (tested deprecated session-level character selection)
- Result: 12 passing tests, 0 failures (was 5 passing, 14 broken)

### PR 2: api-game ACL

**HTTP Endpoints (`api-game/app.py`):**
- Imports replaced: `SessionStartRequest` → `SessionStartPayload`, plus `SessionEndFinalState`, `SessionEndResponse`, `PlayerState`, `SessionStats`, `MapConfig`, `ImageConfig` from `shared_contracts`
- `create_session`: request body typed as `SessionStartPayload`, map/image restoration uses attribute access instead of `.get()`, audio config dumped via `model_dump()` for MongoDB
- `end_session`: builds typed objects (`PlayerState`, `SessionStats`, `MapConfig`, `ImageConfig`, `SessionEndFinalState`) instead of raw dicts

**WebSocket Handlers (`api-game/websocket_handlers/websocket_events.py`):**
- `remote_audio_play`: raw dict construction → `AudioChannelState(...)` + `.model_dump()`
- `remote_audio_batch`: all 11 operation branches (play, stop, pause, resume, volume, loop, load, clear, effects, mute, solo) converted to construct `AudioChannelState` before `.model_dump()` to MongoDB
- `load`/`clear` track config saving uses `AudioTrackConfig` + `AudioEffects`
- Broadcast fields read from schema attributes (`.volume`, `.looping`, `.effects.model_dump()`)

**GameService (`api-game/gameservice.py`):**
- `@staticmethod` added to `_get_active_session()` (was working by accident via class-level call)
- `_get_active_session()` — moved `return` inside `try` block, added `raise` in `except` to prevent `NameError` on connection failure

**Local Schemas (`api-game/schemas/session_schemas.py`):**
- Stripped to only `SessionEndRequest` (local-only schema with no shared-contract equivalent)
- All boundary schema definitions removed (replaced by `shared_contracts` imports)

### PR 3: api-site ACL + Tech Debt

**Library Aggregates:**
- `music_asset_aggregate.py` — `build_effects_for_game()` → returns `AudioEffects` (was `dict`), `build_channel_state_for_game()` → returns `AudioChannelState` (was `dict`). Hardcoded defaults removed: volume `0.8`, looping `True`, playback_state `"stopped"` — now owned by contract.
- `sfx_asset_aggregate.py` — added `build_channel_state_for_game()` → returns `AudioChannelState`. SFX defaults to `looping=False` (explicitly overrides contract's `True` default). Fills gap: SFX channels can now be restored via ETL.
- `map_asset_aggregate.py` — `build_grid_config_for_game()` → returns `GridConfig | None` (was `dict | None`), `update_grid_config_from_game()` → accepts `GridConfig` (was `dict`). Hardcoded defaults removed: `"#d1d5db"`, `0.3`, `1` — now owned by `GridColorMode` contract.

**Session Commands (`commands.py`):**
- Cold → Hot (StartSession): Extracted `_restore_audio_config()`, `_restore_map_config()`, `_restore_image_config()` as class methods. Audio restoration now includes `SfxAsset` (was `MusicAsset` only). Payload built as `SessionStartPayload` with `AssetRef` list (was raw dict). Response parsed as `SessionStartResponse`.
- Hot → Cold (`_extract_and_sync_game_state`): Response parsed as `SessionEndResponse` → `SessionEndFinalState` (was raw `response.json()`). All `.get()` chains replaced with typed attribute access. Track config sync uses raw dicts with Optional values to avoid forcing contract defaults back to PostgreSQL.

---

## 3. Challenges

### SQLite test compatibility (PR 1)
The test suite uses in-memory SQLite with monkey-patching for PostgreSQL types. The existing `conftest.py` only patched `UUID` columns. Two additional PG-specific types needed patching:
- `JSONB` → `JSON` (campaigns.invited_player_ids)
- `ARRAY` → `JSON` (media_assets.campaign_ids)

### Stale test fixtures (PR 1)
Multiple test files had fallen behind domain code changes:
- `SendFriendRequest.execute()` renamed `friend_uuid` → `friend_identifier` and became async
- `AcceptFriendRequest.execute()` became async and now requires `user_repo` + `event_manager`
- `CharacterAggregate.create()` changed `character_class` → `character_classes` (multi-class support)
- `SessionEntity.create()` now defaults `name` to `"Session 1"` instead of `None`
- `SelectCharacterForSession` deprecated in favour of campaign-level selection

### pydantic-settings import-time validation (PR 1)
`Settings()` is called at module import time in `shared/dependencies/db.py`, so env vars must be set before pytest even collects `conftest.py`. Solved with module-level `os.environ.setdefault()` calls at the top of conftest (before any app imports).

### Python 3.14 incompatibility (PR 1)
`psycopg2-binary==2.9.9` has no pre-built wheels for Python 3.14 (user's local Fedora Bazzite default). Resolved by using Python 3.12 via pyenv/brew to match Docker/CI targets.

### `_get_active_session()` latent bug (PR 2)
Discovered during review: the method returned `collection` outside the `try` block, meaning a failed MongoDB connection would raise `NameError` instead of the connection error. The `@staticmethod` decorator was also missing — the method worked because all call sites used `GameService._get_active_session()` (class-level call).

### AudioChannelState vs AudioTrackConfig in ETL (PR 3)
Constructing `AudioChannelState` from `AudioTrackConfig` entries would force default values (e.g., `volume=0.8`) into the sync-back-to-PostgreSQL path. Since `AudioTrackConfig.volume` is `Optional[float]` (None = "not set"), wrapping it in `AudioChannelState` would replace None with 0.8. Fixed by extracting common settings as a plain dict, preserving None semantics.

### Variable scoping in StartSession (PR 3)
`campaign_assets`, `asset_lookup`, and `url_map` were only defined inside `if self.asset_repo:` but referenced by the restoration helpers and `AssetRef` construction outside the block. Fixed by initializing defaults before the conditional.

---

## 4. Decisions & Diversions

### D1: Package naming (`contracts/` → `rollplay-shared-contracts/`)

**Plan said:** `contracts/` directory with `rollplay_contracts` Python package
**Shipped:** `rollplay-shared-contracts/` directory with `shared_contracts` Python package

**Rationale:** Multiple naming iterations with user. Key decisions: (1) "shared contracts" preferred over "contracts" to avoid future naming conflicts, (2) parent directory should match pip package name for human readability, (3) `shared_contracts` as Python import name since `rollplay_contracts` felt too tied to the Next.js app.

### D2: No `src/` layout

**Plan said:** `src/` directory inside package root
**Shipped:** Flat layout — `shared_contracts/` directly under `rollplay-shared-contracts/`

**Rationale:** Extra `src/` directory served no purpose with only one package inside.

### D3: Build backend (`setuptools.backends._legacy:_Backend` → `setuptools.build_meta`)

**Plan said:** `build-backend = "setuptools.backends._legacy:_Backend"`
**Shipped:** `build-backend = "setuptools.build_meta"`

**Rationale:** The legacy backend path was outdated.

### D4: CI coverage check (pytest → shell grep)

**Plan said:** Not specified in detail
**Shipped:** Shell-based `grep` check in CI (no Python required), followed by pytest as a separate job

**Rationale:** Initially implemented as a pytest test class, but user pointed out running it in CI then running all tests (including it) was redundant. Changed to a shell grep that checks every `.py` module in `shared_contracts/` has a corresponding import in `test_contracts.py`.

### D5: Docker layer ordering (Copilot PR review)

**Plan said:** Contracts installed before requirements
**Shipped:** Requirements installed first, then contracts

**Rationale:** Copilot PR review correctly identified that requirements change less often than contracts, so installing them first gives better Docker layer cache hits.

### D6: Test infrastructure fixes (unplanned scope addition, PR 1)

**Plan said:** Zero service code changes
**Shipped:** Fixed broken test infrastructure (conftest, 3 test files, deleted 1 deprecated test file)

**Rationale:** Setting up local pytest + CI exposed 14 pre-existing test failures. Fixing them was necessary for CI to pass.

### D7: api-site CI workflow (unplanned scope addition, PR 1)

**Plan said:** CI for contracts only
**Shipped:** Additional `api-site.yml` workflow that runs api-site pytest on changes to `api-site/` or `rollplay-shared-contracts/`

**Rationale:** Natural extension while setting up CI.

### D8: Keep `session_schemas.py` (plan said delete)

**Plan said:** Delete `api-game/schemas/session_schemas.py`
**Shipped:** Kept the file with only `SessionEndRequest`

**Rationale:** `SessionEndRequest` is a local api-game request model (contains only `session_id: str`) with no cross-service meaning. Placing it in shared contracts would be incorrect.

### D9: No re-exports through local schemas (user course-correction)

**Initial attempt:** Re-exported all contract types through `session_schemas.py` for convenience
**Shipped:** Direct imports from `shared_contracts` in all consuming files, no re-exports

**Rationale:** User correctly identified that re-exporting contract types through local schema modules blurs the line between shared contracts and local schemas.

### D10: `map_config` variable naming (user course-correction)

**Initial attempt:** `mc` shorthand, then `map` (Python built-in)
**Shipped:** `map_config`

**Rationale:** `mc` was too terse, `map` shadows the built-in.

### D11: Drive-by fixes in GameService (unplanned, PR 2)

**Plan said:** Extract `_room_filter()` helper
**Shipped:** `room_filter()` was already extracted. Added `@staticmethod` and fixed `_get_active_session()` return/raise logic.

**Rationale:** Both were latent bugs discovered during review.

### D12: SessionEntity fields stay as `Optional[dict]` (PR 3, tech debt #4)

**Plan said:** Type the warehoused state fields
**Shipped:** Fields stay as `Optional[dict]` — typing applied at the application layer instead

**Rationale:** The aggregate holds thin JSONB references for PostgreSQL cold storage. These are not full contract types. Typing at the application layer (where full contract types are constructed and parsed) gives the safety without adding complexity to the persistence layer.

### D13: Opacity default 0.3 → 0.5 (intentional behavioral change, PR 3)

**Old behavior:** `MapAsset.build_grid_config_for_game()` used `self.grid_opacity or 0.3`
**New behavior:** `GridColorMode()` default is `opacity=0.5`

**Rationale:** Contract defaults are the single source of truth.

### D14: SFX channel restoration (new behavior, PR 3)

**Old behavior:** `StartSession._restore_audio_config()` skipped non-`MusicAsset` channels
**New behavior:** Includes `SfxAsset` via `isinstance(asset, (MusicAsset, SfxAsset))`

**Rationale:** SFX channels go through the same ETL pipeline as music channels. Skipping them was a gap from when SfxAsset didn't have `build_channel_state_for_game()`.

---

## 5. Current Architecture

### Package Structure

```
rollplay-shared-contracts/
├── pyproject.toml
├── shared_contracts/
│   ├── __init__.py          # Re-exports all types
│   ├── audio.py             # AudioEffects, AudioChannelState, AudioTrackConfig
│   ├── display.py           # ActiveDisplayType
│   ├── assets.py            # AssetRef
│   ├── map.py               # GridColorMode, GridConfig, MapConfig
│   ├── image.py             # ImageConfig
│   └── session.py           # PlayerState, SessionStats, SessionStartPayload,
│                            # SessionEndFinalState, SessionStartResponse, SessionEndResponse
└── tests/
    └── test_contracts.py    # 30 tests (round-trip, shape, constraints)
```

### Import Map

| Source | What | Used In |
|--------|------|---------|
| `shared_contracts.session` | `SessionStartPayload`, `SessionStartResponse`, `SessionEndResponse`, `SessionEndFinalState`, `PlayerState`, `SessionStats` | api-site `commands.py`, api-game `app.py` |
| `shared_contracts.assets` | `AssetRef` | api-site `commands.py` |
| `shared_contracts.audio` | `AudioChannelState`, `AudioTrackConfig`, `AudioEffects` | api-site `commands.py`, `music_asset_aggregate.py`, `sfx_asset_aggregate.py`; api-game `websocket_events.py` |
| `shared_contracts.map` | `MapConfig`, `GridConfig`, `GridColorMode` | api-site `commands.py`, `map_asset_aggregate.py`; api-game `app.py` |
| `shared_contracts.image` | `ImageConfig` | api-site `commands.py`, api-game `app.py` |
| `shared_contracts.display` | `ActiveDisplayType` | api-site `commands.py` |
| `schemas.session_schemas` | `SessionEndRequest` (local only) | api-game `app.py` |

### ETL Data Flow (Typed)

```
Cold → Hot:
  SessionEntity (thin dict) → asset.build_*_for_game() → contract type
  → SessionStartPayload.model_dump() → HTTP POST → api-game

Hot → Cold:
  api-game → HTTP response → SessionEndResponse (typed parse)
  → final_state.audio_state (Dict[str, AudioChannelState])
  → sync volumes/effects back to asset aggregates
  → extract thin dict references → SessionEntity (JSONB)
```

### Validation Flow

```
HTTP Request → SessionStartPayload (Pydantic validates) → .model_dump() → MongoDB
WebSocket Op → AudioChannelState (Pydantic validates) → .model_dump() → MongoDB
MongoDB Read → raw dict → Typed schema construction → SessionEndResponse → HTTP Response
```

---

## 6. Tech Debt Resolution (PR 3)

| Item | Status | How |
|------|--------|-----|
| #4 SessionEntity dict fields | Resolved (application layer) | Typing at commands.py, aggregate stays dict for JSONB |
| #6 StartSession ~270 lines | Resolved | Extracted 3 restoration helpers + typed payload |
| #8 build_*_for_game() raw dicts | Resolved | All return contract types |
| #9 Duplicate constraints | Resolved | Contract Pydantic constraints validate at construction |
| #10 Hardcoded defaults | Resolved | Contract defaults are single source of truth |

---

## 7. Open Items

None — all 3 PRs complete and merged.
