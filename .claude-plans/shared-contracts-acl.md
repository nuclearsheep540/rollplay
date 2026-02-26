# Plan: Shared Contracts Package + Anti-Corruption Layer

## Context

api-site and api-game communicate via HTTP ETL (session start/pause/finish) and share data shapes for audio, maps, and images. Currently the boundary is untyped — `dict = {}` fields on Pydantic models, raw `.get()` chains throughout api-game, and structural knowledge duplicated across both services. Before Media V2 scales this cross-service data flow, we need a formal contract.

This plan introduces:
1. **`rollplay-contracts`** — a pip-installable Python package of Pydantic boundary schemas
2. **Anti-corruption layer** — validation at api-game's entry points (HTTP + WebSocket)
3. **Contract tests** — verify both services agree on the wire format

## Package Strategy: pip-installable Package

**Why not volume mounts:** If api-game becomes a standalone microservice, it needs to `pip install rollplay-contracts==X.Y.Z` from a package registry — not mount shared source code. The pip approach works identically in monorepo (editable install) and microservice (published package) setups.

### Directory Structure

```
contracts/                          # NEW — repo root
├── pyproject.toml                  # Package metadata, minimal deps (pydantic only)
├── src/
│   └── rollplay_contracts/
│       ├── __init__.py
│       ├── audio.py                # AudioEffects, AudioChannelState, AudioTrackConfig
│       ├── map.py                  # GridColorMode, GridConfig, MapConfig, MapState
│       ├── image.py                # ImageConfig, ImageState
│       ├── session.py              # SessionStartPayload, SessionEndFinalState, PlayerState, SessionStats
│       ├── assets.py               # AssetRef (replaces api-game's current AssetRef)
│       └── display.py              # ActiveDisplayType enum ("map" | "image")
└── tests/
    └── test_contracts.py           # Schema round-trip tests
```

### Package Hosting

**No private PyPI needed.** The package lives as source in the monorepo — both Dockerfiles `COPY` and `pip install` it from the local filesystem at build time. It's a standard Python package with a `pyproject.toml`, not a published artifact.

**If api-game ever becomes its own repo**, that's when you'd publish to a registry (GitHub Packages, AWS CodeArtifact, or a simple S3-hosted index). The import statements (`from rollplay_contracts.audio import AudioChannelState`) never change — only the `pip install` source does.

### Docker Wiring

**Problem:** Current build context is `./api-game` and `./api-site`, so Dockerfiles can't `COPY` the `contracts/` directory (it's outside their context). We widen the build context to repo root.

**docker-compose.dev.yml changes:**
```yaml
api-game:
  build:
    context: .                                    # Changed: repo root (was ./api-game)
    dockerfile: docker/dev/api-game/Dockerfile    # Changed: relative to new context
  volumes:
    - ./api-game:/api
    - ./contracts:/contracts                      # Dev hot-reload of schema changes

api-site:
  build:
    context: .                                    # Changed: repo root (was ./api-site)
    dockerfile: docker/dev/api-site/Dockerfile    # Changed: relative to new context
  volumes:
    - ./api-site:/api
    - ./contracts:/contracts                      # Dev hot-reload of schema changes
```

**docker-compose.yml (prod) — same context change:**
```yaml
api-game:
  build:
    context: .                                    # Changed: repo root (was ./api-game)
    dockerfile: docker/prod/api-game/Dockerfile

api-site:
  build:
    context: .                                    # Changed: repo root (was ./api-site)
    dockerfile: docker/prod/api-site/Dockerfile
```

**Root `.dockerignore`** (prevents sending entire repo as build context):
```
rollplay/
.next/
node_modules/
.git/
*.md
.claude-plans/
.claude-debriefs/
docker/
```

**Dev Dockerfiles** — explicit `pip install` (e.g., `docker/dev/api-game/Dockerfile`):
```dockerfile
FROM python:3.12-slim

# Install shared contracts package first (changes less often → better layer caching)
COPY contracts /contracts
RUN pip install -e /contracts

# Install service
RUN mkdir /api
COPY api-game /api
WORKDIR /api
RUN pip install --upgrade pip
RUN pip install --upgrade -r requirements.txt
RUN pip install pyyaml

CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8081", "--reload", "--log-config", "./config/log_conf.yaml"]
```

**Why `-e` (editable) in dev:** Creates a symlink to `/contracts` instead of copying to site-packages. Combined with the volume mount (`./contracts:/contracts`), schema changes are reflected immediately without rebuilding the container.

**Prod Dockerfiles** — same pattern but non-editable install:
```dockerfile
COPY contracts /contracts
RUN pip install /contracts    # Copies to site-packages (no symlink)
```

**Future (separate repos):** Replace `COPY contracts` + `pip install` with `pip install rollplay-contracts==X.Y.Z` in requirements.txt. One line change per service.

---

## Phase 1: Package Scaffolding + Core Audio Schemas

Audio is the most complex and most duplicated boundary data. Start here.

### 1a. Create package skeleton

**File: `contracts/pyproject.toml`**
```toml
[project]
name = "rollplay-contracts"
version = "0.1.0"
description = "Shared boundary schemas between Rollplay services"
requires-python = ">=3.12"
dependencies = ["pydantic>=2.0"]

[build-system]
requires = ["setuptools>=68.0"]
build-backend = "setuptools.backends._legacy:_Backend"

[tool.setuptools.packages.find]
where = ["src"]
```

### 1b. Audio schemas

**File: `contracts/src/rollplay_contracts/audio.py`**

```python
from typing import Literal

class AudioEffects(BaseModel):
    """Effect toggle state — V1 stores booleans only, V2 will add parameters."""
    hpf: bool = False
    lpf: bool = False
    reverb: bool = False

class AudioChannelState(BaseModel):
    """Complete state of a single audio channel (BGM or SFX) in MongoDB.

    Constraints are defined here (not in aggregates) so api-game validates
    at the point of construction — malformed data never reaches MongoDB.
    """
    # Identity
    filename: Optional[str] = None
    asset_id: Optional[str] = None
    s3_url: Optional[str] = None
    # Playback config (persistent) — with value constraints
    volume: float = Field(default=0.8, ge=0.0, le=1.3)
    looping: bool = True
    effects: AudioEffects = AudioEffects()
    # Channel-level state (persistent, survives track swaps)
    muted: bool = False
    soloed: bool = False
    # Runtime state (not persisted to PostgreSQL)
    playback_state: Literal["playing", "paused", "stopped"] = "stopped"
    started_at: Optional[float] = Field(default=None, ge=0)  # Unix timestamp, non-negative
    paused_elapsed: Optional[float] = Field(default=None, ge=0)

class AudioTrackConfig(BaseModel):
    """Stashed config for a track swapped out of a channel. Keyed by asset_id."""
    volume: Optional[float] = Field(default=None, ge=0.0, le=1.3)
    looping: Optional[bool] = None
    effects: AudioEffects = AudioEffects()
    paused_elapsed: Optional[float] = Field(default=None, ge=0)
```

**Constraint design principle:** Constraints that are universal (volume range, playback state values) go in the contract schema. Rules that are domain-specific ("only music assets can have effects") stay in api-site aggregates. If api-game constructs an `AudioChannelState(volume=2.0)`, Pydantic raises `ValidationError` immediately — the data never reaches MongoDB, and ETL never encounters invalid data.

### 1c. Display enum

**File: `contracts/src/rollplay_contracts/display.py`**

```python
class ActiveDisplayType(str, Enum):
    MAP = "map"
    IMAGE = "image"
```

### 1d. Asset ref

**File: `contracts/src/rollplay_contracts/assets.py`**

```python
class AssetRef(BaseModel):
    """Reference to a library asset crossing the service boundary."""
    id: str
    filename: str
    s3_key: str
    asset_type: str   # "map", "music", "sfx", "image"
    s3_url: Optional[str] = None
```

---

## Phase 2: Map + Image Schemas

### 2a. Map schemas

**File: `contracts/src/rollplay_contracts/map.py`**

```python
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

### 2b. Image schemas

**File: `contracts/src/rollplay_contracts/image.py`**

```python
class ImageConfig(BaseModel):
    """Image state for ETL boundary."""
    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str              # Presigned S3 URL
```

---

## Phase 3: Session Envelope Schemas

Replace the untyped `dict` fields on SessionStartRequest/SessionEndResponse.

**File: `contracts/src/rollplay_contracts/session.py`**

```python
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

---

## Phase 4: Anti-Corruption Layer in api-game

The ACL is a thin validation layer at api-game's entry points. Not a framework — just Pydantic validation at the boundary.

### 4a. HTTP endpoints (app.py)

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

### 4b. WebSocket handlers (websocket_events.py)

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

This catches malformed data at the point of construction rather than silently storing garbage.

### 4c. GameService refactoring (gameservice.py)

Two improvements while we're here:

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

### 4d. Delete `api-game/schemas/session_schemas.py`

All schemas now come from `rollplay-contracts`. Remove the old file and update imports.

---

## Phase 5: api-site Integration

api-site's aggregate methods serialize INTO contract schemas instead of returning raw dicts.

### 5a. MusicAssetAggregate

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

### 5b. MapAssetAggregate

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

### 5c. Session commands (StartSession, PauseSession, FinishSession)

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

---

## Phase 6: Contract Tests + CI

Tests verify both sides agree on the wire format. Live in `contracts/tests/`.

### 6a. Round-trip tests (schema self-consistency)

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

### 6b. Shape conformance tests (catch schema drift)

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

### 6c. GitHub Actions CI

No existing workflows in the repo — this is the first. A single workflow that runs contract tests on any PR touching the `contracts/` directory.

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

      - name: Install contracts package
        run: pip install -e ./contracts[test]

      - name: Run contract tests
        run: cd contracts && python -m pytest tests/ -v
```

**`contracts/pyproject.toml` test extras:**
```toml
[project.optional-dependencies]
test = ["pytest>=8.0"]
```

**Future expansion:** Add separate workflows for api-site and api-game that also install contracts and run their own test suites — catching breakage on either consumer side. But the contracts-only workflow is the immediate value.

### 6d. Integration tests (future)

Consumer-driven contract tests where api-site builds a payload and api-game validates it. These would run in CI with both services' test suites importing the contracts package.

---

## Phase 7: Cleanup

1. Remove `api-game/schemas/session_schemas.py` (replaced by contracts)
2. Extract `_build_track_config()` helper in `websocket_events.py` (DRY fix from audit)
3. Remove dead code flagged in audit: `volumeToDb` in AudioTrack.js, move `EFFECT_TYPES` to types.js
4. Update `contracts/` requirements in both services' `requirements.txt`

---

## Implementation Order

| Step | What | Files |
|------|------|-------|
| 1 | Package scaffold + pyproject.toml + Docker wiring | `contracts/`, `docker-compose.dev.yml`, `docker-compose.yml`, Dockerfiles |
| 2 | Audio schemas (AudioEffects, AudioChannelState, AudioTrackConfig) | `contracts/src/rollplay_contracts/audio.py` |
| 3 | Map + Image + Display schemas | `contracts/src/rollplay_contracts/map.py`, `image.py`, `display.py` |
| 4 | Session envelope schemas + AssetRef | `contracts/src/rollplay_contracts/session.py`, `assets.py` |
| 5 | Contract tests | `contracts/tests/test_contracts.py` |
| 6 | GitHub Actions CI | `.github/workflows/contracts.yml` |
| 7 | api-game ACL: HTTP endpoints | `api-game/app.py` |
| 8 | api-game ACL: WebSocket handlers | `api-game/websocket_handlers/websocket_events.py` |
| 9 | api-game: GameService ObjectId helper + typed signatures | `api-game/gameservice.py` |
| 10 | api-site: aggregate serialization methods | `music_asset_aggregate.py`, `map_asset_aggregate.py` |
| 11 | api-site: session commands ETL | `modules/session/application/commands.py` |
| 12 | Delete old schemas, frontend audit cleanup | `api-game/schemas/session_schemas.py`, minor frontend fixes |

---

## Verification

1. `cd contracts && pip install -e . && python -m pytest tests/` — contract tests pass
2. `docker-compose -f docker-compose.dev.yml up --build` — both services start cleanly
3. Start a game session → verify audio, map, image state transfers correctly (cold→hot)
4. Play audio, toggle effects, mute/solo, swap tracks → verify WebSocket operations work
5. Pause session → verify ETL extracts correctly (hot→cold)
6. Resume session → verify state restores correctly (cold→hot again)
7. Late-joiner sync → new player receives correct audio/map/image state
8. `npm run build` — frontend builds clean (no breaking changes to frontend)

---

## What This Does NOT Change

- **Frontend** — no changes; api-game's WebSocket broadcast payloads stay the same shape
- **MongoDB document structure** — stays the same; schemas validate before storage, not the storage format
- **api-site response schemas** (`library/api/schemas.py`, `session/api/schemas.py`) — these serve the frontend, not the boundary
- **WebSocket event types** — same event names, same broadcast format
