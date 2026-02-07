# Map Config Persistence Across Sessions (ETL)

Replicate the working `audio_config` ETL pattern for map configuration so the active map + grid config survives session pause/finish and restores on next start.

## Current State

- `audio_config` persists via JSONB column on Session model — full round-trip works
- Map state lives ONLY in MongoDB `active_maps` collection (separate from `active_sessions`)
- `PauseSession`/`FinishSession` cleanup passes `keep_logs=False` → `active_maps` entries deleted
- Map is completely lost when session ends — DM must re-select every time

## Data Flow (mirrors audio)

```
Session End:   MongoDB active_maps → extract → strip runtime fields → PostgreSQL session.map_config
Session Start: PostgreSQL session.map_config → refresh S3 URL → payload → api-game → MapService.set_active_map()
```

## Cold Storage Shape

Single JSONB object (one active map, not multi-channel like audio):

```json
{
  "asset_id": "uuid",
  "filename": "dungeon_level_1.png",
  "original_filename": "Dungeon Level 1.png",
  "grid_config": { "enabled": true, "grid_width": 20, "grid_height": 15, ... },
  "map_image_config": { ... }
}
```

Empty `{}` = no map was active. Fields deliberately excluded: `file_path` (presigned URL, expires), `room_id`, `uploaded_by`, `active`, `_id`.

---

## Implementation Steps

### 1. Add `asset_id` to MapSettings on api-game

**File: `api-game/mapservice.py`** — `MapSettings` class (line 14)

Add `asset_id: Optional[str] = None` field. Currently the frontend sends `asset_id` (MapSelectionModal.js:140) but MapSettings silently drops it.

### 2. Pass `asset_id` through in map_load WebSocket handler

**File: `api-game/websocket_handlers/websocket_events.py`** — `map_load` method (line 1016)

Add `asset_id=map_data.get("asset_id")` to the MapSettings constructor. The field is already in the incoming data, just not captured.

### 3. Add `map_config` column to PostgreSQL Session model

**File: `api-site/modules/campaign/model/session_model.py`** — after line 60

```python
map_config = Column(JSONB, nullable=True, server_default='{}')
```

### 4. Create Alembic migration

New migration, `down_revision = '6c168329e5f0'` (current HEAD).

```python
op.add_column('sessions', sa.Column('map_config', postgresql.JSONB(astext_type=sa.Text()), server_default='{}', nullable=True))
```

### 5. Add `map_config` to SessionEntity domain aggregate

**File: `api-site/modules/session/domain/session_aggregate.py`** — `__init__` (line 77)

Add `map_config: Optional[dict] = None` parameter + `self.map_config = map_config` assignment, alongside `audio_config`.

### 6. Add `map_config` to SessionRepository

**File: `api-site/modules/session/repositories/session_repository.py`**

Three locations (mirror `audio_config` at each):
- **Update path** (line 73): `model.map_config = aggregate.map_config`
- **Create path** (line 91): `map_config=aggregate.map_config`
- **`_model_to_aggregate`** (line 185): `map_config=model.map_config`

### 7. Include map state in api-game end_session response

**File: `api-game/app.py`** — `end_session` endpoint (line 514-523)

After `"audio_state": room.get("audio_state", {})`, add:

```python
"map_state": map_service.get_active_map(request.session_id) or {}
```

This queries the `active_maps` collection for the room's active map document.

### 8. Extract map config in PauseSession

**File: `api-site/modules/session/application/commands.py`** — PauseSession (after audio extraction, ~line 576)

```python
raw_map = final_state.get("map_state", {})
map_config = {}
if raw_map and raw_map.get("filename"):
    map_config = {
        "asset_id": raw_map.get("asset_id"),
        "filename": raw_map.get("filename"),
        "original_filename": raw_map.get("original_filename"),
        "grid_config": raw_map.get("grid_config"),
        "map_image_config": raw_map.get("map_image_config"),
    }
logger.info(f"🗺️ Extracted map config: {'has map' if map_config else 'no active map'}")
```

Persist in Phase 2 (after `session.audio_config = audio_config`): `session.map_config = map_config`

### 9. Extract map config in FinishSession

Same file — identical extraction pattern in FinishSession (after its audio extraction).

### 10. Restore map config on StartSession

**File: `api-site/modules/session/application/commands.py`** — StartSession (after audio restoration, ~line 409)

```python
map_config_with_url = {}
if session.map_config and session.map_config.get("asset_id"):
    map_asset_id = session.map_config["asset_id"]
    fresh_url = asset_url_lookup.get(map_asset_id)
    if fresh_url:
        map_config_with_url = {**session.map_config, "file_path": fresh_url}
        logger.info(f"🗺️ Restoring map: {session.map_config.get('filename')}")
    else:
        logger.warning(f"🗺️ Cannot restore map: asset {map_asset_id} not in campaign assets")
```

Add to payload: `"map_config": map_config_with_url`

### 11. Add `map_config` to SessionStartRequest schema

**File: `api-game/schemas/session_schemas.py`** — `SessionStartRequest` (line 25)

```python
map_config: dict = {}
```

### 12. Restore map in api-game create_session endpoint

**File: `api-game/app.py`** — `create_session` endpoint (after `GameService.create_room`, ~line 441)

```python
if request.map_config and request.map_config.get("filename"):
    try:
        restored_map = MapSettings(
            room_id=request.session_id,
            asset_id=request.map_config.get("asset_id"),
            filename=request.map_config["filename"],
            original_filename=request.map_config.get("original_filename", request.map_config["filename"]),
            file_path=request.map_config.get("file_path", ""),
            grid_config=request.map_config.get("grid_config"),
            map_image_config=request.map_config.get("map_image_config"),
            uploaded_by="system",
            active=True
        )
        map_service.set_active_map(request.session_id, restored_map)
        logger.info(f"🗺️ Restored map '{request.map_config['filename']}' for session {request.session_id}")
    except Exception as e:
        logger.warning(f"🗺️ Map restoration failed (non-fatal): {e}")
```

Map restoration failure is non-fatal — session starts without a map.

---

## Files Modified

| # | File | Change |
|---|------|--------|
| 1 | `api-game/mapservice.py` | Add `asset_id` field to `MapSettings` |
| 2 | `api-game/websocket_handlers/websocket_events.py` | Pass `asset_id` in `map_load` handler |
| 3 | `api-site/modules/campaign/model/session_model.py` | Add `map_config` JSONB column |
| 4 | `api-site/alembic/versions/` | New migration for `map_config` column |
| 5 | `api-site/modules/session/domain/session_aggregate.py` | Add `map_config` to `__init__` |
| 6 | `api-site/modules/session/repositories/session_repository.py` | Add `map_config` to save/load (3 spots) |
| 7 | `api-game/app.py` | Include `map_state` in end response; restore map on start |
| 8 | `api-site/modules/session/application/commands.py` | Extract in Pause+Finish; restore in Start |
| 9 | `api-game/schemas/session_schemas.py` | Add `map_config` to `SessionStartRequest` |

---

## Edge Cases

- **No active map**: `map_state` is `{}`, `map_config` stored as `{}`, next start skips restoration
- **Map asset deleted**: `asset_url_lookup` won't find it, warning logged, session starts without map
- **Map cleared mid-session**: `get_active_map()` returns None (active=False), stored as `{}`
- **Grid config changes mid-session**: `update_complete_map` updates MongoDB atomically; ETL extracts latest grid_config

## Verification

1. Start session, select map with grid → map displays
2. Pause session → check `session.map_config` in PostgreSQL (should have asset_id, filename, grid_config)
3. Start session again → map auto-loads with same grid config
4. Finish session → same persistence check
5. Delete map asset from library, start session → warning logged, session starts without map
6. Start session with no previous map → no map loaded, no errors
7. `docker exec api-site-dev alembic current` confirms migration applied
