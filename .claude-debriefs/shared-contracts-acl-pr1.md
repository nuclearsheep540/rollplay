# Debrief: Shared Contracts Package + Anti-Corruption Layer (PR 1)

**Plan file:** `.claude-plans/shared-contracts-acl.md`
**Branch:** `shared-contracts-PR-1` — PR #84
**Period:** 2026-03-09
**Status:** PR 1 complete — package, schemas, Docker wiring, CI, and test fixes all delivered

---

## 1. Goals Set

PR 1 scope from the plan:
- Create pip-installable shared contracts package with all boundary schemas
- Wire into both Docker services (dev + prod)
- Add contract tests (round-trip, shape conformance, constraint validation)
- Set up GitHub Actions CI for contracts
- **Zero service code changes** — both services install but don't import yet

## 2. What Was Delivered

### Package (`rollplay-shared-contracts/`)
- `pyproject.toml` — package metadata
- `shared_contracts/__init__.py` — re-exports all types
- `shared_contracts/audio.py` — AudioEffects, AudioChannelState, AudioTrackConfig
- `shared_contracts/display.py` — ActiveDisplayType enum
- `shared_contracts/assets.py` — AssetRef
- `shared_contracts/map.py` — GridColorMode, GridConfig, MapConfig
- `shared_contracts/image.py` — ImageConfig
- `shared_contracts/session.py` — PlayerState, SessionStats, SessionStartPayload, SessionEndFinalState, SessionStartResponse, SessionEndResponse

### Contract Tests (`rollplay-shared-contracts/tests/test_contracts.py`)
- 30 tests across 3 categories: round-trip (13), shape conformance (7), constraint validation (10)
- All 6 schema modules covered

### Docker Wiring
- `.dockerignore` — prevents sending frontend/git/plans to Docker build context
- `docker-compose.dev.yml` + `docker-compose.yml` — build context widened to repo root
- All 4 Dockerfiles updated (dev + prod for api-game + api-site)
- Dev: editable install (`-e`) with volume mounts for hot-reload
- Prod: non-editable install with optimised layer ordering

### CI (`.github/workflows/`)
- `contracts.yml` — 2-job pipeline: shell-based coverage check → pytest
- `api-site.yml` — runs api-site pytest on changes to `api-site/` or `rollplay-shared-contracts/`

### Test Infrastructure Fixes (unplanned but necessary)
- `conftest.py` — test env vars, JSONB/ARRAY SQLite patches, FriendCode model import, mock_event_manager fixture, create_character multi-class support, create_friendship async handling
- `test_friendship_flow.py` — updated for async commands + renamed parameters
- `test_campaign_with_session.py` — updated session name assertions
- `test_character_session_joining.py` — deleted (tested deprecated session-level character selection)
- Result: 12 passing tests, 0 failures (was 5 passing, 14 broken)

## 3. Challenges

### SQLite test compatibility
The test suite uses in-memory SQLite with monkey-patching for PostgreSQL types. The existing `conftest.py` only patched `UUID` columns. Two additional PG-specific types needed patching:
- `JSONB` → `JSON` (campaigns.invited_player_ids)
- `ARRAY` → `JSON` (media_assets.campaign_ids)

### Stale test fixtures
Multiple test files had fallen behind domain code changes:
- `SendFriendRequest.execute()` renamed `friend_uuid` → `friend_identifier` and became async
- `AcceptFriendRequest.execute()` became async and now requires `user_repo` + `event_manager`
- `CharacterAggregate.create()` changed `character_class` → `character_classes` (multi-class support)
- `SessionEntity.create()` now defaults `name` to `"Session 1"` instead of `None`
- `SelectCharacterForSession` deprecated in favour of campaign-level selection

### pydantic-settings import-time validation
`Settings()` is called at module import time in `shared/dependencies/db.py`, so env vars must be set before pytest even collects `conftest.py`. Solved with module-level `os.environ.setdefault()` calls at the top of conftest (before any app imports).

### Python 3.14 incompatibility
`psycopg2-binary==2.9.9` has no pre-built wheels for Python 3.14 (user's local Fedora Bazzite default). Resolved by using Python 3.12 via pyenv/brew to match Docker/CI targets.

## 4. Decisions & Diversions

### D1: Package naming (`contracts/` → `rollplay-shared-contracts/`)

**Plan said:** `contracts/` directory with `rollplay_contracts` Python package
**Shipped:** `rollplay-shared-contracts/` directory with `shared_contracts` Python package

**Rationale:** Multiple naming iterations with user. Key decisions: (1) "shared contracts" preferred over "contracts" to avoid future naming conflicts, (2) parent directory should match pip package name for human readability, (3) `shared_contracts` as Python import name since `rollplay_contracts` felt too tied to the Next.js app.

**Impact on PR 2/3:** All imports will be `from shared_contracts.audio import ...` not `from rollplay_contracts.audio import ...`

### D2: No `src/` layout (`src/rollplay_contracts/` → `shared_contracts/`)

**Plan said:** `src/` directory inside package root
**Shipped:** Flat layout — `shared_contracts/` directly under `rollplay-shared-contracts/`

**Rationale:** Extra `src/` directory served no purpose with only one package inside. `pyproject.toml` uses `[tool.setuptools.packages.find] include = ["shared_contracts*"]` instead of `where = ["src"]`.

### D3: Build backend (`setuptools.backends._legacy:_Backend` → `setuptools.build_meta`)

**Plan said:** `build-backend = "setuptools.backends._legacy:_Backend"`
**Shipped:** `build-backend = "setuptools.build_meta"`

**Rationale:** The legacy backend path was outdated. `setuptools.build_meta` is the standard modern backend.

### D4: CI coverage check (pytest → shell grep)

**Plan said:** Not specified in detail
**Shipped:** Shell-based `grep` check in CI (no Python required), followed by pytest as a separate job

**Rationale:** Initially implemented as a pytest test class (`TestContractCoverage`), but user pointed out running it in CI then running all tests (including it) was redundant. Changed to a shell grep that checks every `.py` module in `shared_contracts/` has a corresponding `from shared_contracts.X import` line in `test_contracts.py`. Runs as a prerequisite job before the actual test job.

### D5: Docker layer ordering (Copilot PR review)

**Plan said:** Contracts installed before requirements
**Shipped:** Requirements installed first, then contracts

**Rationale:** Copilot PR review comment #4 correctly identified that requirements change less often than contracts, so installing them first gives better Docker layer cache hits. Reordered both prod Dockerfiles.

### D6: Test infrastructure fixes (unplanned scope addition)

**Plan said:** Zero service code changes
**Shipped:** Fixed broken test infrastructure (conftest, 3 test files, deleted 1 deprecated test file)

**Rationale:** Setting up local pytest + CI exposed 14 pre-existing test failures across friendship, session, and character modules. These were stale fixtures that hadn't been updated when domain code changed. Fixing them was necessary for CI to pass and was in-scope since we were implementing CI as part of this PR. The deprecated `test_character_session_joining.py` (testing session-level character locks) was deleted since that feature moved to campaign-level.

### D7: api-site CI workflow (unplanned scope addition)

**Plan said:** CI for contracts only
**Shipped:** Additional `api-site.yml` workflow that runs api-site pytest on changes to `api-site/` or `rollplay-shared-contracts/`

**Rationale:** Natural extension while setting up CI. Ensures api-site tests run in CI, not just locally. Required adding dummy env vars for pydantic-settings.

## 5. Downstream Readiness

| PR 2/3 Dependency | What PR 1 Delivered | Ready? |
|---|---|---|
| Package installable in both services | `pip install` works in all 4 Dockerfiles | Yes |
| All boundary schemas defined | 6 modules, 15 Pydantic models | Yes |
| Contract tests validate schemas | 30 tests, all passing | Yes |
| CI catches schema drift | Coverage check + pytest in CI | Yes |
| Import path stable | `from shared_contracts.audio import AudioChannelState` | Yes |
| api-site tests pass in CI | 12 tests passing, env vars configured | Yes |

## 6. Open Items

- PR #84 has Copilot review comments — user handling responses to 6 of 7 (layer ordering was the only one actioned)
- PR ready for merge pending user review
