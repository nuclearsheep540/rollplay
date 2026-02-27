# Plan: Shared Contracts Package + Anti-Corruption Layer

## Context

api-site and api-game communicate via HTTP ETL (session start/pause/finish) and share data shapes for audio, maps, and images. Currently the boundary is untyped — `dict = {}` fields on Pydantic models, raw `.get()` chains throughout api-game, and structural knowledge duplicated across both services. Before Media V2 scales this cross-service data flow, we need a formal contract.

This plan introduces:
1. **`rollplay-contracts`** — a pip-installable Python package of Pydantic boundary schemas
2. **Anti-corruption layer** — validation at api-game's entry points (HTTP + WebSocket)
3. **Contract tests** — verify both services agree on the wire format

### Constraint Design Principle

Constraints that are universal (volume range, playback state values) go in the contract schema. Rules that are domain-specific ("only music assets can have effects") stay in api-site aggregates. If api-game constructs an `AudioChannelState(volume=2.0)`, Pydantic raises `ValidationError` immediately — the data never reaches MongoDB, and ETL never encounters invalid data.

### PR Strategy

The work splits into 3 independent PRs to isolate risk:

| PR | Scope | Risk | Regression |
|----|-------|------|------------|
| **PR 1** | Package scaffold + all schemas + Docker wiring + contract tests + CI | None | Zero — no service code changes |
| **PR 2** | api-game ACL — adopt contract schemas at HTTP + WebSocket boundaries | Medium | Contained to api-game |
| **PR 3** | api-site integration — aggregates + session commands use contract types | Medium | Contained to api-site |

PR 2 and PR 3 are independent of each other and can land in either order. Both depend on PR 1.

---

## PR 1: Package + Schemas + Docker Wiring + Tests + CI

### What

Create the `rollplay-contracts` pip-installable package with all boundary schemas, wire it into both Docker services, add contract tests, and set up the first GitHub Actions CI workflow. **Zero service code changes** — both services install the package but don't import it yet.

### Package Strategy

**No private PyPI needed.** The package lives as source in the monorepo — both Dockerfiles `COPY` and `pip install` it from the local filesystem at build time. It's a standard Python package with a `pyproject.toml`, not a published artifact.

**If api-game ever becomes its own repo**, that's when you'd publish to a registry (GitHub Packages, AWS CodeArtifact, or a simple S3-hosted index). The import statements (`from rollplay_contracts.audio import AudioChannelState`) never change — only the `pip install` source does.

### Package Structure

```
contracts/                          # NEW — repo root
├── pyproject.toml                  # Package metadata, minimal deps (pydantic only)
├── src/
│   └── rollplay_contracts/
│       ├── __init__.py             # Re-exports key types for convenience
│       ├── audio.py                # AudioEffects, AudioChannelState, AudioTrackConfig
│       ├── map.py                  # GridColorMode, GridConfig, MapConfig
│       ├── image.py                # ImageConfig
│       ├── session.py              # SessionStartPayload, SessionEndFinalState, PlayerState, SessionStats
│       ├── assets.py               # AssetRef (replaces api-game's current AssetRef)
│       └── display.py              # ActiveDisplayType enum ("map" | "image")
└── tests/
    └── test_contracts.py           # Schema round-trip + shape conformance tests
```

### Package Skeleton

**File: `contracts/pyproject.toml`**
```toml
[project]
name = "rollplay-contracts"
version = "0.1.0"
description = "Shared boundary schemas between Rollplay services"
requires-python = ">=3.12"
dependencies = ["pydantic>=2.0"]

[project.optional-dependencies]
test = ["pytest>=8.0"]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[tool.setuptools.packages.find]
where = ["src"]
```

### Schema Definitions

**Audio (`contracts/src/rollplay_contracts/audio.py`):**

```python
from typing import Literal, Optional
from pydantic import BaseModel, Field

class AudioEffects(BaseModel):
    """Effect toggle state — V1 stores booleans only, V2 will add parameters."""
    hpf: bool = False
    lpf: bool = False
    reverb: bool = False

class AudioChannelState(BaseModel):
    """Complete state of a single audio channel (BGM or SFX) in MongoDB."""
    # Identity
    filename: Optional[str] = None
    asset_id: Optional[str] = None
    s3_url: Optional[str] = None
    # Playback config (persistent)
    volume: float = Field(default=0.8, ge=0.0, le=1.3)
    looping: bool = True
    effects: AudioEffects = AudioEffects()
    # Channel-level state (persistent, survives track swaps)
    muted: bool = False
    soloed: bool = False
    # Runtime state (not persisted to PostgreSQL)
    playback_state: Literal["playing", "paused", "stopped"] = "stopped"
    started_at: Optional[float] = Field(default=None, ge=0)
    paused_elapsed: Optional[float] = Field(default=None, ge=0)

class AudioTrackConfig(BaseModel):
    """Stashed config for a track swapped out of a channel. Keyed by asset_id."""
    volume: Optional[float] = Field(default=None, ge=0.0, le=1.3)
    looping: Optional[bool] = None
    effects: AudioEffects = AudioEffects()
    paused_elapsed: Optional[float] = Field(default=None, ge=0)
```

**Display (`contracts/src/rollplay_contracts/display.py`):**

```python
from enum import Enum

class ActiveDisplayType(str, Enum):
    MAP = "map"
    IMAGE = "image"
```

**Assets (`contracts/src/rollplay_contracts/assets.py`):**

```python
from typing import Optional
from pydantic import BaseModel

class AssetRef(BaseModel):
    """Reference to a library asset crossing the service boundary."""
    id: str
    filename: str
    s3_key: str
    asset_type: str   # "map", "music", "sfx", "image"
    s3_url: Optional[str] = None
```

**Map (`contracts/src/rollplay_contracts/map.py`):**

```python
from typing import Any, Dict, Optional
from pydantic import BaseModel, Field

class GridColorMode(BaseModel):
    line_color: str = "#d1d5db"
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    line_width: int = Field(default=1, ge=1, le=10)

class GridConfig(BaseModel):
    grid_width: int = Field(default=20, ge=1, le=100)
    grid_height: int = Field(default=20, ge=1, le=100)
    enabled: bool = True
    colors: Optional[Dict[str, GridColorMode]] = None  # "edit_mode", "display_mode"

class MapConfig(BaseModel):
    """Map state for ETL boundary (session start/end)."""
    asset_id: str = Field(..., min_length=1)
    filename: str = Field(..., min_length=1)
    original_filename: Optional[str] = None
    file_path: str = Field(..., min_length=1)  # Presigned S3 URL
    grid_config: Optional[GridConfig] = None
    map_image_config: Optional[Dict[str, Any]] = None  # Opaque to contracts, owned by frontend
```

**Image (`contracts/src/rollplay_contracts/image.py`):**

```python
from typing import Optional
from pydantic import BaseModel

class ImageConfig(BaseModel):
    """Image state for ETL boundary."""
    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str  # Presigned S3 URL
```

**Session (`contracts/src/rollplay_contracts/session.py`):**

```python
from typing import Dict, List, Optional
from pydantic import BaseModel

from .audio import AudioChannelState, AudioTrackConfig
from .assets import AssetRef
from .map import MapConfig
from .image import ImageConfig
from .display import ActiveDisplayType

class PlayerState(BaseModel):
    player_name: str
    seat_position: int
    seat_color: str

class SessionStats(BaseModel):
    duration_minutes: int
    total_logs: int
    max_players: int

class SessionStartPayload(BaseModel):
    """Complete payload for POST /game/session/start"""
    session_id: str
    campaign_id: str
    dm_username: str
    max_players: int = 8
    joined_user_ids: List[str] = []
    assets: List[AssetRef] = []
    audio_config: Dict[str, AudioChannelState] = {}
    audio_track_config: Dict[str, AudioTrackConfig] = {}
    map_config: Optional[MapConfig] = None
    image_config: Optional[ImageConfig] = None
    active_display: Optional[ActiveDisplayType] = None

class SessionEndFinalState(BaseModel):
    """Structure of final_state returned by POST /game/session/end"""
    players: List[PlayerState] = []
    session_stats: Optional[SessionStats] = None
    audio_state: Dict[str, AudioChannelState] = {}
    audio_track_config: Dict[str, AudioTrackConfig] = {}
    map_state: Optional[MapConfig] = None
    image_state: Optional[ImageConfig] = None
    active_display: Optional[ActiveDisplayType] = None

class SessionStartResponse(BaseModel):
    success: bool
    session_id: str
    message: str = ""

class SessionEndResponse(BaseModel):
    success: bool
    final_state: SessionEndFinalState
    message: str = ""
```

### Docker Wiring

**Problem:** Current build context is `./api-game` and `./api-site`, so Dockerfiles can't `COPY` the `contracts/` directory (it's outside their context). We widen the build context to repo root.

**docker-compose.dev.yml changes:**

```yaml
# BEFORE:
api-game:
    build:
        context: ./api-game
        dockerfile: ../docker/dev/api-game/Dockerfile
    volumes:
        - ./api-game:/api

api-site:
    build:
        context: ./api-site
        dockerfile: ../docker/dev/api-site/Dockerfile
    volumes:
        - ./api-site:/api

# AFTER:
api-game:
    build:
        context: .                                    # Changed: repo root
        dockerfile: docker/dev/api-game/Dockerfile    # Changed: relative to new context
    volumes:
        - ./api-game:/api
        - ./contracts:/contracts                      # Dev hot-reload of schema changes

api-site:
    build:
        context: .                                    # Changed: repo root
        dockerfile: docker/dev/api-site/Dockerfile    # Changed: relative to new context
    volumes:
        - ./api-site:/api
        - ./contracts:/contracts                      # Dev hot-reload of schema changes
```

**docker-compose.yml (prod) — same context change:**

```yaml
# BEFORE:
api-game:
    build:
        context: ./api-game
        dockerfile: ../docker/prod/api-game/Dockerfile

api-site:
    build:
        context: ./api-site
        dockerfile: ../docker/prod/api-site/Dockerfile

# AFTER:
api-game:
    build:
        context: .                                    # Changed: repo root
        dockerfile: docker/prod/api-game/Dockerfile

api-site:
    build:
        context: .                                    # Changed: repo root
        dockerfile: docker/prod/api-site/Dockerfile
```

**Root `.dockerignore` (NEW — prevents sending entire repo as build context):**

```
rollplay/
.next/
node_modules/
.git/
*.md
.claude-plans/
.claude-debriefs/
```

**Dev Dockerfiles** — With the widened context, `COPY . /api` would copy the whole repo. We need explicit paths instead.

`docker/dev/api-game/Dockerfile`:
```dockerfile
FROM python:3.12-slim

# Install shared contracts package first (changes less often → better layer caching)
COPY contracts /contracts
RUN pip install -e /contracts

RUN mkdir /api
COPY api-game /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--reload", "--log-config", "./config/log_conf.yaml"]
```

`docker/dev/api-site/Dockerfile`:
```dockerfile
FROM python:3.12-slim

# Install shared contracts package first
COPY contracts /contracts
RUN pip install -e /contracts

RUN mkdir /api
COPY api-site /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt

COPY api-site/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082", "--reload"]
```

Why `-e` (editable) in dev: Creates a symlink to `/contracts` instead of copying to site-packages. Combined with the volume mount (`./contracts:/contracts`), schema changes are reflected immediately without rebuilding the container.

**Prod Dockerfiles** — same pattern but non-editable install.

`docker/prod/api-game/Dockerfile`:
```dockerfile
FROM python:3.12-slim

# Install shared contracts package (non-editable in prod)
COPY contracts /contracts
RUN pip install /contracts

RUN mkdir /api
COPY api-game /api

WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--log-config", "./config/log_conf.yaml"]
```

`docker/prod/api-site/Dockerfile`:
```dockerfile
# Copyright (C) 2025 Matthew Davey
# SPDX-License-Identifier: GPL-3.0-or-later

FROM python:3.12-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \
    gcc \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install shared contracts package (non-editable in prod)
COPY contracts /contracts
RUN pip install /contracts

# Copy requirements first for better caching
COPY api-site/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY api-site/ .

# Copy and prepare entrypoint script
COPY api-site/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 8082

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8082/health || exit 1

# Run the application (no reload in production)
ENTRYPOINT ["/entrypoint.sh"]
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8082"]
```

**Future (separate repos):** Replace `COPY contracts` + `pip install` with `pip install rollplay-contracts==X.Y.Z` in requirements.txt. One line change per service.

### Contract Tests

**File: `contracts/tests/test_contracts.py`**

Round-trip tests (schema self-consistency):
```python
def test_audio_channel_state_round_trip():
    state = AudioChannelState(filename="boss.mp3", asset_id="abc-123", volume=0.9)
    dumped = state.model_dump()
    restored = AudioChannelState.model_validate(dumped)
    assert restored == state

def test_session_start_payload_round_trip():
    payload = SessionStartPayload(session_id="s1", campaign_id="c1", dm_username="dm")
    dumped = payload.model_dump()
    restored = SessionStartPayload.model_validate(dumped)
    assert restored == payload
```

Shape conformance tests (catch schema drift):
```python
def test_audio_channel_state_has_required_fields():
    """Ensure the schema covers all fields api-game expects."""
    required_keys = {"filename", "asset_id", "s3_url", "volume", "looping",
                     "effects", "muted", "soloed", "playback_state",
                     "started_at", "paused_elapsed"}
    schema_keys = set(AudioChannelState.model_fields.keys())
    assert required_keys.issubset(schema_keys)

def test_audio_effects_is_flat_booleans():
    """V1 effects are flat booleans, not nested objects."""
    effects = AudioEffects()
    dumped = effects.model_dump()
    assert all(isinstance(v, bool) for v in dumped.values())
```

### GitHub Actions CI

No existing workflows in the repo — this is the first. A single workflow that runs contract tests on any PR touching the `contracts/` directory.

**Editable vs installed install — why it matters:**

| Environment | Install mode | What it tests |
|-------------|-------------|---------------|
| Local dev | `pip install -e` (editable) | Source files directly via symlink — fast iteration |
| CI / prod | `pip install` (non-editable) | The real built artifact in `site-packages` |

CI deliberately uses **non-editable** install to catch packaging bugs that editable mode hides — e.g. a misconfigured `packages.find` in `pyproject.toml`, a missing `__init__.py`, or a `where = ["src"]` path that doesn't match the actual layout. These issues are invisible in editable mode because Python resolves imports from the source tree, but they cause `ModuleNotFoundError` in prod.

**File: `.github/workflows/contracts.yml`**
```yaml
name: Contract Tests

on:
  pull_request:
    paths:
      - 'contracts/**'
  push:
    branches: [main]
    paths:
      - 'contracts/**'

jobs:
  test-contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-python@v5
        with:
          python-version: '3.12'

      - name: Install contracts package (non-editable — matches prod)
        run: pip install ./contracts[test]

      - name: Run contract tests
        run: cd contracts && python -m pytest tests/ -v
```

Future expansion: Add separate workflows for api-site and api-game that also install contracts and run their own test suites — catching breakage on either consumer side.

### Key Files

| File | Action |
|------|--------|
| `contracts/pyproject.toml` | **Create** — package metadata |
| `contracts/src/rollplay_contracts/__init__.py` | **Create** — re-exports |
| `contracts/src/rollplay_contracts/audio.py` | **Create** — AudioEffects, AudioChannelState, AudioTrackConfig |
| `contracts/src/rollplay_contracts/display.py` | **Create** — ActiveDisplayType enum |
| `contracts/src/rollplay_contracts/assets.py` | **Create** — AssetRef |
| `contracts/src/rollplay_contracts/map.py` | **Create** — GridColorMode, GridConfig, MapConfig |
| `contracts/src/rollplay_contracts/image.py` | **Create** — ImageConfig |
| `contracts/src/rollplay_contracts/session.py` | **Create** — SessionStartPayload, SessionEndFinalState, responses |
| `contracts/tests/test_contracts.py` | **Create** — round-trip + conformance tests |
| `.github/workflows/contracts.yml` | **Create** — first CI workflow |
| `.dockerignore` | **Create** — exclude frontend/git from build context |
| `docker-compose.dev.yml` | Modify — widen build context for api-game, api-site |
| `docker-compose.yml` | Modify — widen build context for api-game, api-site |
| `docker/dev/api-game/Dockerfile` | Modify — COPY contracts + pip install -e |
| `docker/dev/api-site/Dockerfile` | Modify — COPY contracts + pip install -e |
| `docker/prod/api-game/Dockerfile` | Modify — COPY contracts + pip install |
| `docker/prod/api-site/Dockerfile` | Modify — COPY contracts + pip install |

### Implementation Order

| Step | What |
|------|------|
| 1 | Package scaffold: `pyproject.toml`, `__init__.py` |
| 2 | Audio schemas: `audio.py` |
| 3 | Supporting schemas: `display.py`, `assets.py`, `map.py`, `image.py` |
| 4 | Session envelope schemas: `session.py` |
| 5 | Contract tests: `test_contracts.py` |
| 6 | Docker wiring: compose files, Dockerfiles, `.dockerignore` |
| 7 | GitHub Actions CI: `contracts.yml` |

### Verification

1. `cd contracts && pip install -e .[test] && python -m pytest tests/ -v` — contract tests pass (editable, local dev)
1b. `cd contracts && pip install .[test] && python -m pytest tests/ -v` — contract tests pass (non-editable, simulates CI/prod)
2. `docker-compose -f docker-compose.dev.yml up --build` — both services start cleanly with contracts installed
3. `docker exec api-game-dev python -c "from rollplay_contracts.audio import AudioChannelState; print('ok')"` — importable in api-game
4. `docker exec api-site-dev python -c "from rollplay_contracts.session import SessionStartPayload; print('ok')"` — importable in api-site
5. Start a game session → verify existing functionality unchanged (no service code was modified)

---

## PR 2: api-game Anti-Corruption Layer

### What

Replace api-game's local `session_schemas.py` with contract imports and add Pydantic validation at every boundary — HTTP endpoints and WebSocket handlers. Raw `.get()` chains become schema construction, catching malformed data at the point of entry rather than silently storing garbage in MongoDB. Also extract a DRY `_room_filter()` helper in GameService (currently repeated 15+ times).

**Depends on:** PR 1 merged. Independent of PR 3.

### HTTP Endpoints (`api-game/app.py`)

Replace `SessionStartRequest` and `SessionEndResponse` imports to use contracts:

```python
from rollplay_contracts.session import SessionStartPayload, SessionEndFinalState, SessionEndResponse

# create_session endpoint: request body is now fully typed
async def create_session(request: SessionStartPayload):
    # request.audio_config is Dict[str, AudioChannelState] — validated
    # request.map_config is Optional[MapConfig] — validated
    ...

# end_session endpoint: build typed response
final_state = SessionEndFinalState(
    players=[PlayerState(...)],
    audio_state={ch_id: AudioChannelState(**ch) for ch_id, ch in raw_audio.items()},
    ...
)
return SessionEndResponse(success=True, final_state=final_state)
```

### WebSocket Handlers (`api-game/websocket_handlers/websocket_events.py`)

The `remote_audio_batch` handler builds channel state via `.get()` chains. Replace with schema construction:

```python
from rollplay_contracts.audio import AudioChannelState, AudioTrackConfig, AudioEffects

# Before (raw dict):
channel_state = {
    "filename": op.get("filename"),
    "asset_id": op.get("asset_id"),
    "volume": op.get("volume", 0.8),
    ...
}

# After (validated schema):
channel_state = AudioChannelState(
    filename=op.get("filename"),
    asset_id=op.get("asset_id"),
    volume=op.get("volume", 0.8),
    ...
)
GameService.update_audio_state(client_id, track_id, channel_state.model_dump())
```

This catches malformed data at the point of construction rather than silently storing garbage in MongoDB.

### GameService Refactoring (`api-game/gameservice.py`)

**Extract ObjectId helper** (DRY — currently repeated 15+ times):
```python
@staticmethod
def _room_filter(room_id: str) -> dict:
    try:
        return {"_id": ObjectId(oid=room_id)}
    except Exception:
        return {"_id": room_id}
```

**Type method signatures** using contracts:
```python
@staticmethod
def update_audio_state(room_id: str, channel_id: str, channel_state: dict):
    # Accepts dict (from .model_dump()) — MongoDB needs plain dicts
    ...

@staticmethod
def save_track_config(room_id: str, asset_id: str, config: dict):
    ...
```

Note: GameService methods still accept `dict` because pymongo needs plain dicts. The validation happens at the caller (WebSocket handler / HTTP endpoint), not inside GameService.

### Delete Old Schemas

Remove `api-game/schemas/session_schemas.py` — all schemas now come from `rollplay-contracts`. Update all imports in `app.py`.

### Key Files

| File | Action |
|------|--------|
| `api-game/app.py` | Modify — replace schema imports with contract imports |
| `api-game/websocket_handlers/websocket_events.py` | Modify — replace `.get()` chains with schema construction |
| `api-game/gameservice.py` | Modify — extract `_room_filter()` helper, typed signatures |
| `api-game/schemas/session_schemas.py` | **Delete** — replaced by contracts |

### Implementation Order

| Step | What |
|------|------|
| 1 | HTTP endpoints adopt contract schemas |
| 2 | WebSocket handlers replace `.get()` chains with schema construction |
| 3 | GameService: extract `_room_filter()` helper, type method signatures |
| 4 | Delete `session_schemas.py`, update all imports |

### Verification

1. `docker-compose -f docker-compose.dev.yml up --build` — api-game starts cleanly
2. Start a game session → verify audio, map, image state transfers correctly (cold→hot)
3. Play audio, toggle effects, mute/solo, swap tracks → verify WebSocket operations work
4. Pause session → verify ETL extracts correctly (hot→cold)
5. Resume session → verify state restores correctly (cold→hot again)
6. Late-joiner sync → new player receives correct audio/map/image state

---

## PR 3: api-site Integration

### What

api-site's aggregate `build_*_for_game()` methods return contract types instead of raw dicts. Session commands (`StartSession`, `PauseSession`, `FinishSession`) construct and parse typed payloads. This means api-site validates the data it produces before sending it over the wire — catching bugs at the source rather than at the destination.

**Depends on:** PR 1 merged. Independent of PR 2.

### MusicAssetAggregate

Existing `build_*_for_game()` methods already return the right shapes as dicts. Change return types to contract schemas:

```python
from rollplay_contracts.audio import AudioEffects, AudioChannelState

def build_effects_for_game(self) -> AudioEffects:
    return AudioEffects(
        hpf=self.effect_hpf_enabled or False,
        lpf=self.effect_lpf_enabled or False,
        reverb=self.effect_reverb_enabled or False,
    )

def build_channel_state_for_game(self, s3_url: str) -> AudioChannelState:
    return AudioChannelState(
        asset_id=str(self.id),
        filename=self.filename,
        s3_url=s3_url,
        volume=self.default_volume or 0.8,
        looping=self.default_looping if self.default_looping is not None else True,
        effects=self.build_effects_for_game(),
    )
```

### MapAssetAggregate

```python
from rollplay_contracts.map import MapConfig, GridConfig, GridColorMode

def build_map_config_for_game(self, s3_url: str) -> MapConfig:
    return MapConfig(
        asset_id=str(self.id),
        filename=self.filename,
        original_filename=self.filename,
        file_path=s3_url,
        grid_config=self.build_grid_config_for_game(),
    )
```

### Session Commands (StartSession, PauseSession, FinishSession)

```python
from rollplay_contracts.session import SessionStartPayload, SessionEndFinalState
from rollplay_contracts.audio import AudioChannelState

# StartSession: build typed payload
payload = SessionStartPayload(
    session_id=str(session.id),
    campaign_id=str(session.campaign_id),
    audio_config={ch_id: asset.build_channel_state_for_game(url) for ...},
    map_config=map_asset.build_map_config_for_game(url) if map_asset else None,
    ...
)
response = await client.post(url, json=payload.model_dump())

# PauseSession: parse typed response
final_state = SessionEndFinalState.model_validate(response_data["final_state"])
# Now final_state.audio_state["channel_A"].volume is typed, not .get("volume")
```

### Key Files

| File | Action |
|------|--------|
| `api-site/modules/library/domain/music_asset_aggregate.py` | Modify — return contract types from `build_*_for_game()` |
| `api-site/modules/library/domain/map_asset_aggregate.py` | Modify — return contract types from `build_*_for_game()` |
| `api-site/modules/session/application/commands.py` | Modify — typed payloads in StartSession, PauseSession, FinishSession |

### Implementation Order

| Step | What |
|------|------|
| 1 | MusicAssetAggregate returns contract types |
| 2 | MapAssetAggregate returns contract types |
| 3 | StartSession builds typed payload |
| 4 | PauseSession/FinishSession parse typed responses |

### Verification

1. `docker-compose -f docker-compose.dev.yml up --build` — api-site starts cleanly
2. Start a game session → verify audio, map, image state transfers correctly (cold→hot)
3. Pause session → verify ETL extracts correctly (hot→cold)
4. Resume session → verify state restores correctly (cold→hot again)
5. `npm run build` — frontend builds clean (no breaking changes)

---

## What This Does NOT Change

- **Frontend** — no changes; api-game's WebSocket broadcast payloads stay the same shape
- **MongoDB document structure** — stays the same; schemas validate before storage, not the storage format
- **api-site response schemas** (`library/api/schemas.py`, `session/api/schemas.py`) — these serve the frontend, not the service boundary
- **WebSocket event types** — same event names, same broadcast format

---

## Design Discussion Notes (Pre-Implementation)

These notes capture architectural questions raised during plan review, before any code was written. They document the reasoning behind key decisions so the "why" isn't lost when revisiting this work.

### 1. "Isn't this just duplicating our API schemas?"

**Concern:** api-site already defines Pydantic response schemas (`library/api/schemas.py`, `session/api/schemas.py`). Shared contracts define more Pydantic schemas. Doesn't this create a DRY violation — the same data shape defined in multiple places?

**Resolution:** They serve different consumers with genuinely different shapes:

| Schema layer | Audience | Example fields |
|-------------|----------|----------------|
| `session/api/schemas.py` | Frontend (browser) | `host_name`, `roster`, `joined_users`, `status` |
| `library/api/schemas.py` | Frontend (browser) | `user_id`, `campaign_ids`, `created_at`, `content_type` |
| `rollplay_contracts/session.py` | api-game (internal ETL) | `audio_config`, `map_config`, `dm_username`, `assets` |

API schemas describe what the frontend sends/receives. Contract schemas describe what api-site sends to api-game over the internal HTTP ETL boundary. The overlap is at the *field* level (both mention `volume`, `looping`) but they're different projections of the same domain data for different consumers. The contracts aren't duplicating API schemas — they're formalising a boundary that currently has **no schema at all** (raw dicts).

### 2. "Does api-site even need shared contracts?"

**Concern:** The only boundary between api-site and api-game is the ETL layer. api-game is the service that actually operates on `AudioChannelState`, `MapConfig`, etc. api-site doesn't read `playback_state` or calculate offsets from `started_at`. So would api-site even import from `rollplay-contracts`?

**Analysis:** api-site's role varies by moment in the session lifecycle:

| Moment | api-site's role | Needs to understand the shape? |
|--------|----------------|-------------------------------|
| First start (no prior state) | **Translate** asset defaults → initial channel state | Yes — once, to build the initial payload |
| Pause/end | **Store** whatever api-game returns | No — opaque JSONB blob |
| Resume | **Forward** the stored blob back | No — pass-through |

api-site only *constructs* channel state once — the first time a track loads into a session. After that, api-game owns the runtime state and api-site just warehouses it.

**Decision:** PR 3 (api-site integration) is not strictly essential — the core value is in PR 1 (define contracts) + PR 2 (api-game validates). But using contract types in api-site's `build_*_for_game()` methods and session commands means:
- Typos and missing fields fail at construction time in api-site, not silently at api-game
- Adding a required field to the contract forces both sides to update
- The contract is *actually shared*, not just "a package api-game happens to use"

If you build the infrastructure but only one side uses it, the contract is just a local schema with extra steps. Both sides using it is what makes it a genuine shared contract.

### 3. "Where does `build_channel_state_for_game()` belong?"

**Concern:** `MusicAsset.build_channel_state_for_game()` sits on the aggregate but returns a shape that belongs to api-game's domain. The aggregate is reaching across service boundaries. Is this domain logic or ETL translation?

**Analysis:** It's ETL translation, not domain logic. The aggregate knows its own defaults (`default_volume`, `default_looping`, effect flags) and translates them into the initial runtime shape api-game expects. It's a factory that produces a one-time initial state.

With shared contracts (PR 3), the return type changes from `dict` to `AudioChannelState`, which makes the translation typed. The method is still a boundary translator — it's just no longer producing an unvalidated dict.

An alternative design would move this translation to the `StartSession` command (application layer), keeping the aggregate purely domain-focused. The current design keeps it on the aggregate for convenience — the aggregate has direct access to its own fields. Either placement is valid; what matters is that the output is typed.

### 4. "Why JSONB instead of relational tables for session state?"

**Concern:** If we're formalising these data shapes with contracts, should we also model them as proper relational tables in PostgreSQL instead of JSONB columns? Would that be more "correct"?

**Resolution:** JSONB is the right choice for data api-site **warehouses but doesn't own**. The ownership test:

| Data | Who owns it? | Who queries individual fields? | Storage |
|------|-------------|-------------------------------|---------|
| Scene audio channels | api-site (DM edits in Workshop) | api-site (filters, defaults cascade) | Relational tables |
| Session runtime audio state | api-game (live playback) | api-game (via MongoDB) | JSONB in PostgreSQL |

If api-site broke `audio_state` into relational tables (`session_audio_channels` with columns for `volume`, `playback_state`, `paused_elapsed`), it would be modelling api-game's runtime domain in its own database. Every time api-game's channel state evolves, you'd need an Alembic migration on api-site for data api-site never reads field-by-field.

JSONB says: "I'm storing this opaque blob for you, I'll give it back exactly as I received it." The shared contract validates what goes *into* and comes *out of* that JSONB — the storage format stays opaque, the boundaries are typed.

The scene-builder-v2 plan validates this distinction: scenes get proper relational tables (api-site owns them), session runtime state stays JSONB (api-site warehouses it).

### 5. The Scene Builder motivation

**Why now?** This plan could arguably wait — V1's ETL works fine with raw dicts today. The driver is scene-builder-v2, which significantly scales the cross-service data flow:

- **Three-tier effects cascade:** Asset defaults (PostgreSQL) → Scene overrides (PostgreSQL) → Live tweaks (MongoDB). The same audio configuration shape flows from api-site through scene deployment into api-game and back. Three tiers of untyped dicts hoping they agree is fragile.
- **Scene deployment:** A single click sends background + positioned images + multi-channel audio + SFX simultaneously. That payload is significantly richer than today's `StartSession` — exactly the kind of complex envelope that breaks silently with raw dicts.
- **Effects model evolution:** V1 contracts define `AudioEffects` as flat booleans (`hpf: bool`). V2 adds `frequency`, `mix`, `preset` per effect. With typed schemas, that's an explicit migration both services acknowledge. Without them, someone adds `effect_hpf_frequency` on one side and hopes the other picks it up.
- **Shared components across boundaries:** `GridConfigEditor.js` is shared between Workshop (writes to PostgreSQL via api-site) and game view (reads from MongoDB via api-game). The contract ensures `GridConfig` means the same thing on both sides.

Building shared contracts now with V1's simpler shapes means the infrastructure is proven before V2 scales the payload complexity. V1 could survive without it; V2 can't.

### 6. Testing: editable vs non-editable install

**Concern:** How does testing differ between local dev (editable mount) and CI (built package)?

| Environment | Install mode | What it tests |
|-------------|-------------|---------------|
| Local dev | `pip install -e` (editable) | Source files directly via symlink — fast iteration |
| CI / prod | `pip install` (non-editable) | The real built artifact in `site-packages` |

CI deliberately uses non-editable install to catch packaging bugs that editable mode hides — misconfigured `packages.find` in `pyproject.toml`, missing `__init__.py`, or a `where = ["src"]` path that doesn't match the actual layout. These issues are invisible in editable mode because Python resolves imports from the source tree, but they cause `ModuleNotFoundError` in prod.

### Summary mental model

```
┌─────────────────────────────────────────────────────────┐
│ rollplay-contracts (shared package)                     │
│                                                         │
│  Defines the WIRE FORMAT between services:              │
│  - What api-site sends to api-game (SessionStartPayload)│
│  - What api-game returns (SessionEndFinalState)         │
│  - Nested types both sides agree on (AudioChannelState, │
│    MapConfig, ImageConfig, etc.)                        │
│                                                         │
│  Does NOT replace:                                      │
│  - api-site's API schemas (frontend-facing)             │
│  - api-site's domain aggregates (business logic)        │
│  - api-game's internal MongoDB operations               │
└───────────┬──────────────────────────┬──────────────────┘
            │                          │
   ┌────────▼────────┐       ┌────────▼────────┐
   │    api-site      │       │    api-game      │
   │                  │       │                  │
   │ PRODUCES data:   │       │ CONSUMES data:   │
   │ - Aggregates     │  ETL  │ - Validates at   │
   │   build initial  │──────►│   HTTP/WS entry  │
   │   state from     │       │ - Operates on    │
   │   asset defaults │◄──────│   fields during  │
   │                  │  ETL  │   live gameplay   │
   │ WAREHOUSES data: │       │                  │
   │ - Stores runtime │       │ RETURNS data:    │
   │   state as JSONB │       │ - Final state at │
   │ - Doesn't parse  │       │   session end    │
   │   individual     │       │                  │
   │   fields         │       │                  │
   └──────────────────┘       └──────────────────┘
```

**Key principle:** api-site is a *producer* (first start) and *warehouse* (pause/resume) of game state. api-game is the *consumer* and *operator*. The shared contract types the boundary between them — not the internal domain of either service.

### 7. Contracts vs storage vs domain ownership — final clarification

**Concern:** If shared contracts define the same data shapes that relational tables model (volume, effects, grid config), who actually "owns" the shape? Does having a contract mean we don't need relational tables, or vice versa?

**Resolution:** These are three independent concerns:

| Concern | What it answers | Example |
|---------|----------------|---------|
| **Shared contract** | "What does this data look like on the wire?" | `AudioChannelState` — both services agree on the shape |
| **Storage strategy** | "How does each service persist this data internally?" | Relational (api-site owns it) or JSONB (api-site warehouses it) |
| **Domain ownership** | "Who has business logic for this data?" | api-site owns asset/scene config; api-game owns runtime playback state |

The shared contract doesn't dictate storage. It ensures structural trust at the ETL boundary — when data crosses from one service to the other, both sides agree on the shape. Each service then stores that data however it wants internally.

**Current state (V1):** api-site warehouses runtime state as JSONB. The shared contract validates the blob's shape, giving confidence even without relational storage.

**Future state (V2 Scene Builder):** api-site will need proper relational aggregates for all media that a DM can edit in Workshop (audio tracks, map configs, effects, images). These are domain objects api-site owns with business logic — they belong in relational tables. The runtime snapshot from api-game stays JSONB (warehoused, not owned). Shared contracts serve both patterns — they validate the JSONB warehouse blobs AND type the relational data when it crosses the ETL boundary.

**Key takeaway:** Shared contracts define what the data looks like. Storage strategy (relational vs JSONB) and domain ownership (who has business logic) are separate decisions made per service, per data type.

### 8. Contracts as shared domain value objects, not just wire format

**Evolution:** Through discussion, the role of shared contracts shifted from "boundary schemas" to something stronger: **shared domain value objects** that are the single source of truth for data shapes and universal constraints.

**The problem with "just schemas":** If contracts only define wire format, then both the contract (`AudioChannelState.volume: Field(ge=0.0, le=1.3)`) and the aggregate (`if not 0.0 <= default_volume <= 1.3: raise ValueError`) define the same business rule. That's a single-responsibility violation — change one, forget the other, and constraints silently diverge.

**The solution — aggregates compose contract types:**

```python
# Contract defines the WHAT (shape + universal constraints)
class AudioChannelState(BaseModel):
    volume: float = Field(default=0.8, ge=0.0, le=1.3)

# Aggregate defines the WHO/WHEN/HOW (domain rules + lifecycle)
class MusicAssetAggregate:
    channel_config: AudioChannelState  # shape defined once, in contracts

    def update_volume(self, volume: float, user_id: UUID):
        if user_id != self.owner_id:
            raise PermissionError("Only asset owner can change volume")
        self.channel_config = self.channel_config.model_copy(
            update={"volume": volume}  # Pydantic validates constraints
        )
```

**What this means:**
- Contracts own **shape + universal invariants** (volume range, valid playback states, grid bounds) — defined once, enforced everywhere
- Aggregates own **domain rules** (permissions, workflow, lifecycle) — who can change what, under what conditions
- Aggregates no longer duplicate field definitions — they compose contract types as their internal value objects
- `build_channel_state_for_game()` becomes trivial — the aggregate already holds an `AudioChannelState`, nothing to translate

**Constraint placement test:**
- "Volume must be between 0.0 and 1.3" → **Contract** (universal, same rule everywhere)
- "Only the campaign host can edit scene audio" → **Aggregate** (domain rule, service-specific)
- "Only music assets can have effects" → **Aggregate** (domain rule, asset-type-specific)

**Impact on PR scope:** PR 1 schemas remain unchanged — the contract types are the same Pydantic models regardless of whether consumers treat them as wire schemas or domain value objects. The shift affects PR 3 (api-site integration), where aggregates would compose contract types rather than just returning them from builder methods. This is a stronger integration than the plan originally described, but results in less code overall (no duplicated field definitions or validation).

### 9. The real picture — same domain, different execution modes

**Key realisation:** api-site and api-game are not separate bounded contexts with different domain models. They are the **same domain** operating in two different execution modes:

- **api-site**: CRUD, request-response, PostgreSQL, single-user operations
- **api-game**: Real-time, WebSocket broadcast, MongoDB, multi-client sync

Same domain objects (audio channels, map configs, grid settings). Same business rules (volume range, valid playback states). Different runtime characteristics (persistence vs real-time, single-user vs multiplayer broadcast).

**How we got here:** api-game started as a dumb runtime pipe — receive state from api-site, store it in MongoDB, broadcast changes, trust everything blindly. But as features evolve (Workshop letting DMs edit the same objects in api-site that api-game operates on during live games), api-game needs to understand the domain too. It can no longer blindly trust incoming data.

**What shared contracts actually are:** A **Shared Kernel** (DDD pattern) — the explicitly managed subset of domain model that both services agree to share. This is the correct DDD pattern when two services operate on the same domain concepts but are deployed separately. The anti-pattern would be pretending they have different domains and maintaining two parallel models that must stay in sync manually.

**The Shared Kernel contains:**
- Domain value objects (AudioChannelState, MapConfig, GridConfig, etc.)
- Universal invariants (volume range, grid bounds, valid playback states)
- ETL envelope types (SessionStartPayload, SessionEndFinalState)

**Each service still owns independently:**
- Domain rules and permissions (who can change what)
- Storage strategy (PostgreSQL relational, MongoDB documents, JSONB warehousing)
- API contracts with their own consumers (api-site → frontend, api-game → WebSocket clients)
- Service-specific workflow (CRUD lifecycle vs real-time broadcast lifecycle)

**Why this isn't an anti-pattern:** Shared types across bounded contexts IS an anti-pattern — but that's for contexts with genuinely different domain models (e.g., "Customer" in billing vs shipping). When two services share the same domain and the same business rules, a Shared Kernel is the correct pattern. Volume is volume. Grid config is grid config. Defining it twice and hoping they match is the actual anti-pattern.

### 10. Considered and rejected: OpenAPI / frontend-only validation

**Concern:** Could we use OpenAPI format to define the contracts instead of Pydantic? Or push validation to the frontend via an OpenAPI spec so api-game doesn't need Pydantic at all?

**Analysis:**

- **OpenAPI instead of Pydantic:** OpenAPI is language-agnostic, which is valuable when services are in different languages. Both api-site and api-game are Python — the language-agnostic benefit doesn't apply. OpenAPI would add a codegen step (YAML → Python models) that's slower to iterate, harder to debug, and might not preserve constraint nuances. Pydantic models are already self-documenting and can export to JSON Schema natively via `.model_json_schema()` if we ever need it.

- **Frontend-only validation:** The idea was to let the frontend consume an OpenAPI/JSON Schema spec and enforce constraints (volume slider capped at 1.3), removing the need for api-game to validate. This conflicts with server-authoritative design — any WebSocket client could send `volume: 50.0` if the backend doesn't validate. Frontend validation is UX; backend validation is security.

- **Pydantic → JSON Schema for frontend (free option):** Pydantic generates JSON Schema from contract types at zero cost (`.model_json_schema()`). If the frontend ever wants to consume constraints for UX purposes (auto-capping sliders, form validation), we can expose a schema endpoint without maintaining a separate OpenAPI spec. One source of truth, two consumption formats.

**Decision:** Stick with Pydantic contracts as the single source. Backend validation stays (server-authoritative). Frontend schema consumption is available for free if/when we want it, but isn't a priority for this work.

### 11. Shared contracts vs DTOs

**Concern:** How do shared contracts differ from Data Transfer Objects (DTOs)? Could DTOs achieve the same thing?

**Resolution:** Traditional DTOs are deliberately dumb — plain data carriers with no validation, no constraints, no business logic. Their job is purely structural: "here's the shape of data moving between layers." Our contracts are stronger: they carry universal invariants (`volume: Field(ge=0.0, le=1.3)`) which is validation, not just structure. In DDD terms, they're closer to Value Objects than DTOs — they define shape AND what constitutes valid data, but delegate domain behaviour (permissions, workflow, lifecycle) to the aggregates that compose them.
