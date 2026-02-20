# AudioAsset Domain Model — Match MapAsset Pattern

## Context

The library module has proper domain modeling for maps: `MapAsset` aggregate with a joined-table `map_assets` (grid_width, grid_height, grid_opacity). Audio assets (MUSIC, SFX) are second-class citizens — just single-table inheritance stubs with no extra columns and no domain aggregates:

```python
# Current: empty stubs in audio_asset_models.py
class MusicAssetModel(MediaAsset):
    __mapper_args__ = {'polymorphic_identity': MediaAssetType.MUSIC}

class SfxAssetModel(MediaAsset):
    __mapper_args__ = {'polymorphic_identity': MediaAssetType.SFX}
```

**Goal:** Give audio assets the same treatment as maps — a proper domain aggregate (`AudioAsset`) and a joined-table ORM model (`audio_assets`) with audio-specific fields. MUSIC and SFX share one table (same data shape, different asset_type values).

---

## Audio-Specific Fields

Following the MapAsset pattern (asset-level config that persists across sessions):

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `duration_seconds` | Float, nullable | None | Track length — useful for UI display in library and soundboard. Populated by frontend after Web Audio API decodes the buffer. |
| `default_volume` | Float, nullable | 0.8 | Per-asset preferred volume. Used as starting volume when loaded into a game session. |
| `default_looping` | Boolean, nullable | None | Per-asset loop preference. None = use type default (MUSIC=true, SFX=false). Overrideable per-asset. |

---

## Files to Change

### 1. NEW: `api-site/modules/library/domain/audio_asset_aggregate.py`

Domain aggregate following the `map_asset_aggregate.py` pattern:

```python
@dataclass
class AudioAsset(MediaAssetAggregate):
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None
```

**Methods** (matching MapAsset's pattern):
- `create()` — factory method, validates content_type is audio (mpeg/wav/ogg), forces asset_type to MUSIC or SFX
- `from_base()` — promote a base MediaAssetAggregate to AudioAsset (used by repository when loading from joined tables)
- `update_audio_config(duration_seconds, default_volume, default_looping)` — update audio-specific fields with validation (volume 0.0-1.3, duration >= 0)
- `has_audio_config()` — check if any audio-specific fields are set
- `get_audio_config()` — return audio config as dict for API responses / ETL

### 2. MODIFY: `api-site/modules/library/model/audio_asset_models.py`

Replace the single-table stubs with a joined-table model. MUSIC and SFX share the `audio_assets` table via multi-level polymorphic inheritance:

```python
class AudioAssetModel(MediaAsset):
    """Audio asset base — shared joined table for MUSIC and SFX"""
    __tablename__ = 'audio_assets'

    id = Column(UUID, ForeignKey('media_assets.id', ondelete='CASCADE'), primary_key=True)
    duration_seconds = Column(Float, nullable=True)
    default_volume = Column(Float, nullable=True)
    default_looping = Column(Boolean, nullable=True)

    # No polymorphic_identity — intermediate class

class MusicAssetModel(AudioAssetModel):
    __mapper_args__ = {'polymorphic_identity': MediaAssetType.MUSIC}

class SfxAssetModel(AudioAssetModel):
    __mapper_args__ = {'polymorphic_identity': MediaAssetType.SFX}
```

Multi-level inheritance: `MediaAsset` → `AudioAssetModel` (joined table) → `MusicAssetModel`/`SfxAssetModel` (polymorphic identities). When SQLAlchemy sees asset_type='music', it loads `MusicAssetModel`, joins `media_assets` ← `audio_assets`. Same for 'sfx'.

### 3. MODIFY: `api-site/modules/library/repositories/asset_repository.py`

Follow the MapAsset pattern for AudioAsset handling:

**`_model_to_aggregate()`** — add AudioAsset branch:
```python
if isinstance(model, AudioAssetModel):
    return AudioAsset.from_base(
        base,
        duration_seconds=model.duration_seconds,
        default_volume=model.default_volume,
        default_looping=model.default_looping
    )
```

**`save()`** — add AudioAsset branches:
- Update path: if `isinstance(aggregate, AudioAsset) and isinstance(existing, AudioAssetModel)`, update audio fields
- Create path: if `isinstance(aggregate, AudioAsset)`, create `MusicAssetModel` or `SfxAssetModel` based on `aggregate.asset_type`

Add imports: `AudioAsset`, `AudioAssetModel`, `MusicAssetModel`, `SfxAssetModel`

### 4. MODIFY: `api-site/modules/library/application/commands.py`

**`ConfirmUpload.execute()`** — create AudioAsset for MUSIC/SFX types:
```python
if asset_type == MediaAssetType.MAP:
    asset = MapAsset.create(...)
elif asset_type in (MediaAssetType.MUSIC, MediaAssetType.SFX):
    asset = AudioAsset.create(...)
else:
    asset = MediaAssetAggregate.create(...)
```

**NEW command: `UpdateAudioConfig`** — following the `UpdateGridConfig` pattern:
- Constructor: `repository`, `session_repository` (for active session guard)
- `execute(asset_id, user_id, duration_seconds, default_volume, default_looping)`:
  1. Load asset, verify ownership
  2. Check active session guard
  3. Verify `isinstance(asset, AudioAsset)` (reject non-audio assets)
  4. Call `asset.update_audio_config(...)`
  5. Save and return

### 5. MODIFY: `api-site/modules/library/api/schemas.py`

**Add `AudioAssetResponse`** (extends `MediaAssetResponse`, like `MapAssetResponse`):
```python
class AudioAssetResponse(MediaAssetResponse):
    duration_seconds: Optional[float] = None
    default_volume: Optional[float] = None
    default_looping: Optional[bool] = None
```

**Add `UpdateAudioConfigRequest`**:
```python
class UpdateAudioConfigRequest(BaseModel):
    duration_seconds: Optional[float] = Field(None, ge=0, description="Track duration in seconds")
    default_volume: Optional[float] = Field(None, ge=0.0, le=1.3, description="Default playback volume")
    default_looping: Optional[bool] = Field(None, description="Default loop behavior")
```

### 6. MODIFY: `api-site/modules/library/api/endpoints.py`

**Update `_to_media_asset_response()`** — add AudioAsset branch (like MapAsset branch):
```python
if isinstance(asset, AudioAsset):
    return AudioAssetResponse(
        ...,  # base fields
        duration_seconds=asset.duration_seconds,
        default_volume=asset.default_volume,
        default_looping=asset.default_looping
    )
```

**Add new endpoint** `PATCH /{asset_id}/audio-config` (following the `PATCH /{asset_id}/grid` pattern):
- Response model: `AudioAssetResponse`
- Injects: repo, session_repo, s3_service
- Creates `UpdateAudioConfig` command, calls `execute()`
- Handles `AssetInUseError` → 409, `ValueError` → 400

**Add `AudioAssetResponse` and `UpdateAudioConfigRequest` to schema imports**

### 7. Alembic migration (autogenerated)

Use `alembic revision --autogenerate` — do NOT hand-write the migration. The ORM model changes in step 2 will be detected automatically, creating the `audio_assets` joined table.

After autogenerate, manually add data migration to populate rows for existing MUSIC/SFX assets:
```sql
INSERT INTO audio_assets (id)
SELECT id FROM media_assets WHERE asset_type IN ('music', 'sfx');
```

All audio-specific fields start as NULL (unconfigured), matching how MapAsset grid fields are NULL until configured.

### 8. MODIFY: `api-site/alembic/env.py`

Add import for `AudioAssetModel` (the intermediate joined-table class):
```python
from modules.library.model.audio_asset_models import AudioAssetModel, MusicAssetModel, SfxAssetModel, ImageAssetModel
```

(Replaces the existing `from modules.library.model.audio_asset_models import MusicAssetModel, SfxAssetModel, ImageAssetModel`)

---

## Implementation Order

1. `audio_asset_aggregate.py` — new domain aggregate
2. `audio_asset_models.py` — replace stubs with joined-table model
3. `asset_repository.py` — handle AudioAsset in save/load
4. `commands.py` (library) — ConfirmUpload creates AudioAsset; add UpdateAudioConfig
5. `schemas.py` — add AudioAssetResponse, UpdateAudioConfigRequest
6. `endpoints.py` — add audio-config endpoint, update response helper
7. `alembic/env.py` — update import
8. Migration — create table, migrate existing rows

---

## Edge Cases

- **Existing MUSIC/SFX assets**: Migration inserts `audio_assets` rows with all-NULL fields for every existing MUSIC/SFX row in `media_assets`. No data loss, audio-specific fields populated later.
- **MUSIC ↔ SFX type change**: Both share `audio_assets` table. `change_type()` just updates the discriminator column. Joined-table row stays — no cross-table migration needed.
- **Audio → visual type change (blocked)**: `MediaAssetAggregate.change_type()` already validates content-type compatibility — audio files can't become maps/images. The orphaned `audio_assets` row concern doesn't apply.
- **`ImageAssetModel` unchanged**: IMAGE assets remain single-table inheritance stubs — no extra fields needed for images currently.
- **Volume range 0.0-1.3**: Frontend allows slight boost above 1.0 (to 1.3). `update_audio_config()` validates this range.

## Verification

1. Run migration → verify `audio_assets` table created with rows for all existing MUSIC/SFX assets
2. Upload a new MUSIC asset → verify `audio_assets` row created alongside `media_assets` row
3. Upload a new SFX asset → same verification
4. `GET /api/library/` → MUSIC/SFX assets now return `AudioAssetResponse` with audio-specific fields
5. `PATCH /api/library/{id}/audio-config` with `{"default_volume": 0.5}` → verify field persisted
6. Active session guard: load audio in game → try to update audio-config → expect 409
7. Change type MUSIC → SFX → verify asset still works, audio_assets row intact
8. Delete audio asset → verify both `media_assets` and `audio_assets` rows cascade-deleted

---
---

# Phase 2 (Future): Session Media JSONB → Relational FK References

> **Status: Roadmap — implement after Phase 1 is complete.**
> Phase 1 formalizes the asset-level domain models. Phase 2 replaces the session-level JSONB columns with FK references to those formal tables, so ETL payloads are built from relational data (single source of truth) instead of untyped JSON blobs.

## Context

Session media state (audio channels, active map, active image) is stored as 3 JSONB columns on the `sessions` table: `audio_config`, `map_config`, `image_config`. These are untyped blobs with no FK constraints. After Phase 1, all asset types have proper relational tables — but the session's *pointers to which assets are loaded* are still JSONB strings.

**Goal:** Replace all 3 JSONB columns with proper relational structures:
- Audio channels → new `session_audio_channels` child table (1:many, FK → media_assets)
- Active map → `map_asset_id` FK column on `sessions` (1:1)
- Active image → `image_asset_id` FK column on `sessions` (1:1)

FK constraints (`ON DELETE SET NULL`) automatically handle stale references. JSON payloads to api-game are built at ETL time from relational joins — JSON becomes a transport contract, not storage.

## New Table: `session_audio_channels`

| Column | Type | Constraints |
|--------|------|------------|
| `id` | UUID | PK |
| `session_id` | UUID | FK → sessions(id) ON DELETE CASCADE |
| `asset_id` | UUID | FK → media_assets(id) ON DELETE SET NULL, nullable |
| `channel_key` | VARCHAR(20) | NOT NULL (e.g. "channel_0", "sfx_2") |
| `channel_type` | VARCHAR(10) | NOT NULL ("bgm" or "sfx") |
| `volume` | FLOAT | NOT NULL, default 0.8 |
| `looping` | BOOLEAN | NOT NULL, default true |
| UNIQUE | | (session_id, channel_key) |

## New FK Columns on `sessions`

| Column | Type | Constraints |
|--------|------|------------|
| `map_asset_id` | UUID | FK → media_assets(id) ON DELETE SET NULL |
| `image_asset_id` | UUID | FK → media_assets(id) ON DELETE SET NULL |

## Columns Removed from `sessions`

- `audio_config` (JSONB)
- `map_config` (JSONB)
- `image_config` (JSONB)

## Files to Change

1. **NEW:** `session/domain/session_audio_channel.py` — domain entity
2. **MODIFY:** `session/domain/session_aggregate.py` — replace `audio_config`/`map_config`/`image_config` dicts with typed fields; remove `remove_asset_references()`
3. **NEW:** `campaign/model/session_audio_channel_model.py` — ORM model
4. **MODIFY:** `campaign/model/session_model.py` — drop JSONB, add FK columns
5. **MODIFY:** `session/repositories/session_repository.py` — save/load new structure
6. **MODIFY:** `session/application/commands.py` — StartSession reads relational data for ETL; PauseSession/FinishSession writes back to relational tables (+ grid_config writeback to MapAsset resolves TODO)
7. **MODIFY:** `session/api/endpoints.py` — inject asset_repo for PauseSession/FinishSession
8. **MODIFY:** `library/application/commands.py` — simplify DeleteMediaAsset (remove manual JSONB cleanup, FKs handle it)
9. **NEW:** Alembic migration — create table, add columns, migrate JSONB data, drop JSONB columns
10. **MODIFY:** `alembic/env.py` — import new model

## Key Design Decisions

- **Cold→Hot ETL (StartSession):** Read `session.audio_channels` + `session.map_asset_id` + `session.image_asset_id` → join to `media_assets` for filenames/s3_keys → generate presigned URLs → build JSON payload for api-game
- **Hot→Cold ETL (PauseSession/FinishSession):** Extract from MongoDB → decompose into relational rows/FKs → write grid_config back to MapAsset (single source of truth)
- **JSON payload = transport contract, not storage:** Only exists transiently as the HTTP payload between api-site and api-game
- **FK ON DELETE SET NULL:** Asset deleted → references auto-cleared; StartSession skips null refs gracefully
- **active_display guard:** If `active_display="map"` but `map_asset_id` is NULL (asset deleted), StartSession clears `active_display` before sending payload
