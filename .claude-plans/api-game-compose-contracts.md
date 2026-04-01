# api-game: Compose Shared Contracts Instead of Duplicating Fields

## Context

api-game's local models (`ImageSettings`, `MapSettings`) duplicate fields from shared contracts (`ImageConfig`, `MapConfig`) and add game-specific metadata (`room_id`, `loaded_by`, `active`). Construction sites manually map fields one-by-one, causing the same drift bug 4+ times — most recently `cine_config.style` being silently dropped.

The fix: **compose the contract** inside the local model. The contract arrives whole, gets stored whole in MongoDB, and the frontend reads the same nested shape. One shape everywhere, no translation layers, no drift.

---

## Phase 1: ImageSettings composes ImageConfig

### 1a. Refactor ImageSettings model

**File: `api-game/imageservice.py`**

Replace 9 duplicated fields with one composed contract:

```python
class ImageSettings(BaseModel):
    room_id: str
    loaded_by: str
    active: bool = True
    image_config: ImageConfig  # the whole contract
```

Update methods in `ImageService`:
- `set_active_image()` — stores `image_settings.model_dump()` to MongoDB (nested shape). The display config preservation logic (lines 67–82) currently reads flat fields from existing doc and copies them one-by-one. After refactor, preserve the entire `image_config` subdocument from the existing doc and merge only metadata changes.
- `get_active_image()` — returns the MongoDB doc (already nested shape, no change needed)
- `update_image_config()` — currently only handles `display_mode` and `aspect_ratio` as flat fields. After refactor, update paths become `image_config.display_mode` and `image_config.aspect_ratio` in the MongoDB `$set` operation.

### 1b. Update backend construction sites

**`app.py` ~line 553** — session start ETL:
```python
restored_image = ImageSettings(
    room_id=request.session_id,
    loaded_by="system",
    image_config=image_config,  # contract passes through whole
)
```
**Behavior change**: Currently ETL only restores metadata (asset_id, filename, file_path) and silently drops display_mode, aspect_ratio, image_position_x/y, and cine_config. After composition, the full ImageConfig passes through — this is the actual bug fix.

**`websocket_events.py` ~line 1349** — DM loads image in-game:
Construct `ImageConfig` from the websocket data dict, then wrap in `ImageSettings`. Pydantic validates the dict (including coercing `cine_config` dict → `CineConfig` model) — free validation we didn't have before.

**`websocket_events.py` ~line 1444** — `image_config_update` handler:
Currently reads flat fields from the saved image doc to broadcast:
```python
"display_mode": saved_image.get("display_mode", "float")
```
After refactor, reads from nested path:
```python
"display_mode": saved_image.get("image_config", {}).get("display_mode", "float")
```
The `update_image_config()` service method must also use nested MongoDB paths (`image_config.display_mode` instead of `display_mode`).

### 1c. Update frontend construction site

**`app/game/components/ImageSelectionSection.js` ~line 134** — constructs imageSettings dict when DM selects an image:
```javascript
// BEFORE (flat)
const imageSettings = {
    room_id: roomId,
    asset_id: asset.id,
    filename: asset.filename,
    ...
};

// AFTER (nested)
const imageSettings = {
    room_id: roomId,
    loaded_by: "dm",
    image_config: {
        asset_id: asset.id,
        filename: asset.filename,
        original_filename: asset.filename,
        file_path: asset.s3_url,
        display_mode: asset.display_mode || "float",
        aspect_ratio: asset.aspect_ratio || null,
        image_position_x: asset.image_position_x ?? null,
        image_position_y: asset.image_position_y ?? null,
        cine_config: asset.cine_config || null,
    },
};
```
This file is both a **construction site** (builds the settings dict sent via websocket) AND a **read site** (checks `currentImage?.asset_id` for active state).

### 1d. Update frontend reads

All `activeImage.field` becomes `activeImage.image_config.field`:

| File | Fields accessed | Notes |
|------|----------------|-------|
| `app/map_management/components/ImageDisplay.js` | `display_mode`, `aspect_ratio`, `image_position_x`, `image_position_y`, `file_path`, `filename`, `original_filename`, `cine_config` | Main rendering component |
| `app/game/components/ImageControlsPanel.js` | `display_mode`, `aspect_ratio`, `cine_config` | DM display mode controls |
| `app/game/components/ImageSelectionSection.js` | `asset_id`, `filename` (for active detection at line 292) | `currentImage?.asset_id` → `currentImage?.image_config?.asset_id` |
| `app/map_management/hooks/useImageWebSocket.js` | `original_filename`, `display_mode`, `aspect_ratio` | **Also has `handleImageConfigUpdate` (line 52)** — merges flat broadcast data into activeImage state. After refactor, must merge into `prev.image_config.*` instead of `prev.*` |

Game-specific fields (`room_id`, `loaded_by`, `active`) stay at top level: `activeImage.room_id`.

**Note on config update broadcasts**: The `image_config_update` websocket event broadcasts a flat delta (`{display_mode, aspect_ratio, updated_by}`), not the full nested object. The frontend handler already receives this as a delta and merges it — after refactor it just needs to merge into the `image_config` sub-object instead of the root.

---

## Phase 2: MapSettings composes MapConfig

### 2a. Refactor MapSettings model

**File: `api-game/mapservice.py`**

Replace 6 duplicated fields with one composed contract:

```python
class MapSettings(BaseModel):
    room_id: str
    uploaded_by: str
    active: bool = True
    map_config: MapConfig  # the whole contract
```

Update methods in `MapService`:
- `set_active_map()` — stores `map_settings.model_dump()` to MongoDB (nested shape). `MapConfig.grid_config` is `Optional[GridConfig]` (Pydantic model) — `model_dump()` on the whole settings handles serialization automatically, so the explicit `grid_config.model_dump()` call in `app.py` becomes unnecessary.
- `get_active_map()` — returns the MongoDB doc (already nested, no change needed)
- `update_map_config()` — currently does `$set` with flat paths (`grid_config`, `map_image_config`). After refactor, paths become `map_config.grid_config` and `map_config.map_image_config`.
- `update_complete_map()` — atomic full replacement. After refactor, the incoming `updated_map` dict will have nested `map_config` structure; the method just replaces the whole doc as before.

### 2b. Update backend construction sites

**`app.py` ~line 533** — session start ETL:
```python
restored_map = MapSettings(
    room_id=request.session_id,
    uploaded_by="system",
    map_config=map_config,  # contract passes through whole
)
```
The explicit `grid_config.model_dump() if grid_config else None` conversion is no longer needed — Pydantic handles serialization when `model_dump()` is called on the composed `MapSettings`.

**`websocket_events.py` ~line 1157** — DM loads map in-game:
Construct `MapConfig` from the websocket data dict, then wrap in `MapSettings`.

**`websocket_events.py` ~line 1242** — `map_config_update` handler:
Currently reads flat `grid_config` and `map_image_config` from event data and passes to `update_map_config()`. The service method's `$set` paths change to `map_config.grid_config` and `map_config.map_image_config`. The broadcast data stays flat (it's a delta).

### 2c. Update frontend reads

All `activeMap.field` becomes `activeMap.map_config.field`:

| File | Fields accessed | Notes |
|------|----------------|-------|
| `app/game/components/MapControlsPanel.js` | `file_path`, `grid_config` | |
| `app/game/GameContent.js` | `grid_config` (if any) | Full `setActiveImage`/`setActiveMap` state assignments — these just store the whole doc, no field-level reads to change |
| `app/map_management/components/MapDisplay.js` | `filename`, `file_path`, `grid_config` | |
| `app/map_management/components/MapImageEditor.js` | `file_path` | |
| `app/game/hooks/webSocketEvent.js` | `grid_config`, `map_image_config`, `filename` | `handleMapLoad` reads `map.grid_config` → `map.map_config.grid_config`. `handleMapConfigUpdate` merges flat broadcast delta — needs to merge into `map_config.*` |
| `app/map_management/hooks/useMapWebSocket.js` | `grid_config`, `map_image_config`, `filename` | **Missing from original plan.** `handleMapConfigUpdate` (line 59) merges `grid_config` and `map_image_config` into activeMap state. After refactor, merges into `prev.map_config.*` |

---

## What's NOT changing

- **Shared contracts** — no changes, they already define the correct shapes
- **api-site** — no changes, domain and ETL are correct
- **AudioChannelState** — already IS the contract; the websocket handlers do incremental merge updates (`{**existing, "volume": new_value}`), which is a different pattern
- **GameSettings** — stores audio as plain dicts, separate concern
- **Workshop components** — workshop reads from api-site responses (MediaAssetResponse), not from api-game
- **Config update broadcast shape** — broadcasts remain flat deltas (`{display_mode, aspect_ratio}` / `{grid_config, map_image_config}`). Only the frontend merge target changes from root to sub-object.

---

## MongoDB Document Shape (after)

```json
{
  "room_id": "session-123",
  "loaded_by": "system",
  "active": true,
  "image_config": {
    "asset_id": "img-1",
    "filename": "tavern.jpg",
    "original_filename": "tavern.jpg",
    "file_path": "https://s3...",
    "display_mode": "cine",
    "aspect_ratio": "2.39:1",
    "image_position_x": 30.0,
    "image_position_y": 70.0,
    "cine_config": {
      "visual_overlays": [{ "type": "film_grain", "style": "vintage", ... }],
      "hide_player_ui": true
    }
  }
}
```

Same shape in MongoDB, websocket broadcast, and frontend state.

---

## Files Modified

| File | Change |
|------|--------|
| `api-game/imageservice.py` | Compose `ImageConfig`, update service methods (including nested MongoDB `$set` paths) |
| `api-game/mapservice.py` | Compose `MapConfig`, update service methods (including nested MongoDB `$set` paths) |
| `api-game/app.py` | Simplify session start restoration — pass contracts through whole |
| `api-game/websocket_handlers/websocket_events.py` | Update image_load, map_load construction; update config_update handlers to read nested paths |
| `rollplay/app/map_management/components/ImageDisplay.js` | Nest image field reads under `image_config` |
| `rollplay/app/game/components/ImageControlsPanel.js` | Nest image field reads |
| `rollplay/app/game/components/ImageSelectionSection.js` | **Construction site** + read site: nest imageSettings dict, update active detection |
| `rollplay/app/map_management/hooks/useImageWebSocket.js` | Nest image field reads + update `handleImageConfigUpdate` merge target |
| `rollplay/app/map_management/hooks/useMapWebSocket.js` | **Missing from original plan.** Update `handleMapConfigUpdate` merge target |
| `rollplay/app/game/components/MapControlsPanel.js` | Nest map field reads under `map_config` |
| `rollplay/app/map_management/components/MapDisplay.js` | Nest map field reads |
| `rollplay/app/map_management/components/MapImageEditor.js` | Nest map field reads |
| `rollplay/app/game/hooks/webSocketEvent.js` | Nest map field reads in `handleMapLoad` + update `handleMapConfigUpdate` merge target |
| `rollplay/app/game/GameContent.js` | Nest map/image field reads (if any direct field access beyond state assignment) |

---

## Verification

1. Session start ETL — image and map config fully restored with ALL fields including `cine_config.visual_overlays[].style`
2. In-game image load via IMAGE tab — all fields flow through, overlays render in cine mode
3. In-game map load — grid config preserved and functional
4. Display mode switching — cine overlays render/hide correctly, config update broadcasts work
5. Image position nudging — position values preserved through ETL
6. Workshop save → session restart → game renders correctly (no field drift)
7. Map grid config updates — selective updates via `update_map_config()` write to nested paths correctly
8. Active image detection — ImageSelectionSection correctly identifies current image via nested `image_config.asset_id`
