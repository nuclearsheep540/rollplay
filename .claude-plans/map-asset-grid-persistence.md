# MapAsset Entity + Grid Persistence + Session ETL

## Problem Statement

1. **Grid config lost on reuse**: DM configures grid overlay on a map, but if they use that map in another campaign/session, they must reconfigure from scratch
2. **Map selection lost on session pause/finish**: When session ends, the active map is deleted from MongoDB - DM must re-select every time they resume
3. **Grid belongs to asset, not session**: Grid dimensions (width/height/opacity) are properties of the map image itself, not transient session state

## Solution Overview

Two complementary changes:

1. **MapAsset entity with grid fields** - Grid config stored on the asset in PostgreSQL, persists forever, reusable across campaigns
2. **Simplified session ETL** - Session just remembers which map was active (`asset_id`), grid config comes from the MapAsset on restore

---

## Part 1: MapAsset Entity (Domain Refactor)

### Architecture: Joined Table Inheritance

```
MediaAssetAggregate (base)
    ├── id, filename, s3_key, content_type, asset_type, ...

MapAsset(MediaAssetAggregate) (subclass)
    ├── grid_width: Optional[int]
    ├── grid_height: Optional[int]
    └── grid_opacity: Optional[float]
```

**Database**: `map_assets` table with FK to `media_assets.id`, containing only grid columns.

### Implementation Steps

#### 1.1 Create MapAssetModel First (see 1.2), Then Generate Migration

After creating the ORM model (step 1.2) and registering it in env.py (step 1.10), run:

```bash
docker exec api-site-dev alembic revision --autogenerate -m "add_map_assets_table"
```

Alembic will detect the new `map_assets` table from the model and generate the migration.

**Manual addition needed**: After autogenerate, add data migration to populate existing MAP assets:

```python
# Add to upgrade() after the create_table
op.execute("""
    INSERT INTO map_assets (id)
    SELECT id FROM media_assets WHERE asset_type = 'map'
""")
```

This creates rows for existing maps with NULL grid values (not yet configured).

#### 1.2 Create MapAssetModel (ORM)

**File**: `api-site/modules/library/model/map_asset_model.py` (NEW)

- Extends `MediaAsset` with `__tablename__ = 'map_assets'`
- FK to `media_assets.id`
- Grid columns: `grid_width`, `grid_height`, `grid_opacity`
- `__mapper_args__ = {'polymorphic_identity': 'map'}`

#### 1.3 Update MediaAsset Base Model for Inheritance

**File**: `api-site/modules/library/model/asset_model.py`

SQLAlchemy needs to know how to determine which Python class to return when loading rows. The existing `asset_type` column already contains this information (`'map'`, `'music'`, etc.), so we configure it as the "discriminator":

```python
__mapper_args__ = {
    'polymorphic_on': 'asset_type',  # "Look at this column to decide the class"
    'polymorphic_identity': None,    # Base class has no specific identity
}
```

**How it works**:
- Query loads row with `asset_type = 'map'` → SQLAlchemy returns `MapAssetModel` (joins `map_assets`)
- Query loads row with `asset_type = 'music'` → SQLAlchemy returns base `MediaAsset`

The subclass (MapAssetModel) declares `'polymorphic_identity': 'map'` to claim that identity.

#### 1.4 Create MapAsset Domain Aggregate

**File**: `api-site/modules/library/domain/map_asset_aggregate.py` (NEW)

```python
@dataclass
class MapAsset(MediaAssetAggregate):
    grid_width: Optional[int] = None
    grid_height: Optional[int] = None
    grid_opacity: Optional[float] = None

    def update_grid_config(self, grid_width, grid_height, grid_opacity):
        # Validation: width/height >= 1, opacity 0.0-1.0
        # Updates fields + sets updated_at

    def has_grid_config(self) -> bool:
        return self.grid_width is not None and self.grid_height is not None

    def get_grid_config(self) -> dict:
        return {"grid_width": ..., "grid_height": ..., "grid_opacity": ...}
```

#### 1.5 Update Repository for Polymorphism

**File**: `api-site/modules/library/repositories/asset_repository.py`

- `_model_to_aggregate()`: Return `MapAsset` when `isinstance(model, MapAssetModel)`
- `save()`: Create `MapAssetModel` when `isinstance(aggregate, MapAsset)`

#### 1.6 Add UpdateGridConfig Command

**File**: `api-site/modules/library/application/commands.py`

```python
class UpdateGridConfig:
    def execute(self, asset_id, user_id, grid_width, grid_height, grid_opacity) -> MapAsset:
        asset = self.repository.get_by_id(asset_id)
        # Validate: exists, owned by user, is MapAsset
        asset.update_grid_config(grid_width, grid_height, grid_opacity)
        self.repository.save(asset)
        return asset
```

#### 1.7 Add API Endpoint

**File**: `api-site/modules/library/api/endpoints.py`

```python
@router.patch("/{asset_id}/grid", response_model=MapAssetResponse)
async def update_grid_config(asset_id, request: UpdateGridConfigRequest, ...):
    command = UpdateGridConfig(repo)
    return command.execute(asset_id, user_id, request.grid_width, ...)
```

#### 1.8 Add Schemas

**File**: `api-site/modules/library/schemas/asset_schemas.py`

```python
class UpdateGridConfigRequest(BaseModel):
    grid_width: Optional[int] = Field(None, ge=1, le=100)
    grid_height: Optional[int] = Field(None, ge=1, le=100)
    grid_opacity: Optional[float] = Field(None, ge=0.0, le=1.0)

class MapAssetResponse(MediaAssetResponse):
    grid_width: Optional[int]
    grid_height: Optional[int]
    grid_opacity: Optional[float]
```

#### 1.9 Update ConfirmUpload Command

**File**: `api-site/modules/library/application/commands.py`

When `asset_type == MAP`, create `MapAsset` instead of `MediaAssetAggregate`.

#### 1.10 Register Model in Alembic

**File**: `api-site/alembic/env.py`

```python
from modules.library.model.map_asset_model import MapAssetModel
```

---

## Part 2: Frontend Grid Persistence

### Current Flow (WebSocket only)
```
DM adjusts grid → sendMapConfigUpdate() → WebSocket broadcast → other players see change
                                       ↓
                               MongoDB (active_maps) ← lost on session end
```

### New Flow (WebSocket + API)
```
DM adjusts grid → sendMapConfigUpdate() → WebSocket broadcast → other players see change
              ↓
        PATCH /api/library/assets/{id}/grid → PostgreSQL (map_assets) ← persists forever
```

#### 2.1 Add API Call on Grid Save

**File**: `rollplay/app/map_management/components/GridControls.js` (or wherever grid save is triggered)

When DM saves grid config:
1. Call existing `sendMapConfigUpdate()` for real-time sync
2. Also call `PATCH /api/library/assets/{asset_id}/grid` to persist

```javascript
const saveGridConfig = async (assetId, gridConfig) => {
  // Persist to PostgreSQL
  await fetch(`/api/library/assets/${assetId}/grid`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grid_width: gridConfig.grid_width,
      grid_height: gridConfig.grid_height,
      grid_opacity: gridConfig.opacity
    })
  });

  // Broadcast to players
  sendMapConfigUpdate(filename, gridConfig, null);
};
```

---

## Part 3: Session ETL (Simplified)

### Cold Storage Shape

**Session.map_config (JSONB)**:
```json
{
  "asset_id": "uuid"
}
```

That's it. Grid config comes from the MapAsset, not session storage.

#### 3.1 Add map_config Column to Session

**File**: `api-site/modules/campaign/model/session_model.py`

```python
map_config = Column(JSONB, nullable=True, server_default='{}')
```

#### 3.2 Migration for map_config

After adding the column to the model (step 3.1), run:

```bash
docker exec api-site-dev alembic revision --autogenerate -m "add_session_map_config"
```

Alembic will detect the new `map_config` column and generate the migration.

#### 3.3 Update SessionEntity

**File**: `api-site/modules/session/domain/session_aggregate.py`

Add `map_config: Optional[dict] = None` to `__init__`.

#### 3.4 Update SessionRepository

**File**: `api-site/modules/session/repositories/session_repository.py`

Add `map_config` to save/load paths (3 locations, mirror `audio_config`).

#### 3.5 Include map_state in api-game end_session

**File**: `api-game/app.py` - `end_session` endpoint

```python
"map_state": map_service.get_active_map(request.session_id) or {}
```

#### 3.6 Extract map_config in PauseSession/FinishSession

**File**: `api-site/modules/session/application/commands.py`

```python
raw_map = final_state.get("map_state", {})
map_config = {}
if raw_map and raw_map.get("asset_id"):
    map_config = {"asset_id": raw_map.get("asset_id")}
session.map_config = map_config
```

#### 3.7 Restore map on StartSession

**File**: `api-site/modules/session/application/commands.py`

```python
map_config_with_url = {}
if session.map_config and session.map_config.get("asset_id"):
    map_asset_id = session.map_config["asset_id"]
    map_asset = self.asset_repo.get_by_id(UUID(map_asset_id))
    fresh_url = asset_url_lookup.get(map_asset_id)

    if map_asset and isinstance(map_asset, MapAsset) and fresh_url:
        map_config_with_url = {
            "asset_id": str(map_asset.id),
            "filename": map_asset.filename,
            "file_path": fresh_url,
            "grid_config": map_asset.get_grid_config() if map_asset.has_grid_config() else None
        }

# Add to payload
payload["map_config"] = map_config_with_url
```

#### 3.8 Add map_config to SessionStartRequest

**File**: `api-game/schemas/session_schemas.py`

```python
map_config: dict = {}
```

#### 3.9 Restore map in api-game create_session

**File**: `api-game/app.py` - `create_session` endpoint

```python
if request.map_config and request.map_config.get("filename"):
    restored_map = MapSettings(
        room_id=request.session_id,
        asset_id=request.map_config.get("asset_id"),
        filename=request.map_config["filename"],
        file_path=request.map_config.get("file_path", ""),
        grid_config=request.map_config.get("grid_config"),
        ...
    )
    map_service.set_active_map(request.session_id, restored_map)
```

#### 3.10 Add asset_id to MapSettings

**File**: `api-game/mapservice.py`

```python
asset_id: Optional[str] = None
```

---

## Files Summary

| File | Action | Description |
|------|--------|-------------|
| `api-site/modules/library/model/map_asset_model.py` | CREATE | ORM model (create first) |
| `api-site/alembic/env.py` | MODIFY | Import MapAssetModel (before autogenerate) |
| `api-site/alembic/versions/` | AUTOGEN | `alembic revision --autogenerate` for map_assets table |
| `api-site/alembic/versions/` | AUTOGEN | `alembic revision --autogenerate` for sessions.map_config |
| `api-site/modules/library/model/asset_model.py` | MODIFY | Add polymorphic mapper args |
| `api-site/modules/library/domain/map_asset_aggregate.py` | CREATE | MapAsset domain class |
| `api-site/modules/library/repositories/asset_repository.py` | MODIFY | Polymorphic returns |
| `api-site/modules/library/schemas/asset_schemas.py` | MODIFY | Grid request/response schemas |
| `api-site/modules/library/application/commands.py` | MODIFY | UpdateGridConfig + ConfirmUpload |
| `api-site/modules/library/api/endpoints.py` | MODIFY | PATCH grid endpoint |
| `api-site/modules/campaign/model/session_model.py` | MODIFY | Add map_config column |
| `api-site/modules/session/domain/session_aggregate.py` | MODIFY | Add map_config field |
| `api-site/modules/session/repositories/session_repository.py` | MODIFY | map_config save/load |
| `api-site/modules/session/application/commands.py` | MODIFY | ETL extract/restore |
| `api-game/mapservice.py` | MODIFY | Add asset_id to MapSettings |
| `api-game/app.py` | MODIFY | end_session returns map_state, create_session restores map |
| `api-game/schemas/session_schemas.py` | MODIFY | Add map_config to SessionStartRequest |
| `rollplay/app/map_management/` | MODIFY | API call on grid save |

---

## Edge Cases

| Case | Handling |
|------|----------|
| No active map | `map_config = {}`, session starts without map |
| Map asset deleted | `asset_url_lookup` miss, warning logged, no map restored |
| Grid not yet configured | `MapAsset.has_grid_config() = False`, use frontend defaults |
| Asset type changed (map→image) | `map_assets` row orphaned, cleaned by FK cascade on delete |
| Concurrent grid updates | Last-write-wins (acceptable for this use case) |

---

## Verification

1. Upload new map → creates `MapAsset` with NULL grid values
2. Configure grid (width=20, height=15, opacity=0.5) → persists to `map_assets` table
3. Use same map in different campaign → grid config already present
4. Start session, select map → map displays with grid
5. Pause session → `sessions.map_config` contains `{asset_id: "..."}`
6. Resume session → map auto-loads with grid from `MapAsset`
7. Delete map asset → `map_assets` row cascade deleted
8. `docker exec api-site-dev alembic current` confirms migrations applied
