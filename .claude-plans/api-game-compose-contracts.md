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
- `set_active_image()` — stores `image_settings.model_dump()` to MongoDB (nested shape)
- `get_active_image()` — returns the MongoDB doc (already nested)
- `update_image_config()` — updates fields within the `image_config` subdocument

### 1b. Update construction sites

**`app.py` ~line 553** — session start ETL:
```python
restored_image = ImageSettings(
    room_id=request.session_id,
    loaded_by="system",
    image_config=image_config,  # contract passes through whole
)
```

**`websocket_events.py` ~line 1349** — DM loads image in-game:
Construct `ImageConfig` from the websocket data dict, then wrap in `ImageSettings`.

### 1c. Update frontend reads

All `activeImage.field` becomes `activeImage.image_config.field`:

| File | Fields accessed |
|------|----------------|
| `app/map_management/components/ImageDisplay.js` | `display_mode`, `aspect_ratio`, `image_position_x`, `image_position_y`, `file_path`, `filename`, `original_filename`, `cine_config` |
| `app/game/components/ImageControlsPanel.js` | `display_mode`, `aspect_ratio`, `cine_config` |
| `app/game/components/ImageSelectionSection.js` | `asset_id`, `filename`, `display_mode`, `aspect_ratio`, `image_position_x`, `image_position_y`, `cine_config` |
| `app/map_management/hooks/useImageWebSocket.js` | `original_filename`, `display_mode`, `aspect_ratio` |
| `app/game/GameContent.js` | image-related reads (if any) |

Game-specific fields (`room_id`, `loaded_by`, `active`) stay at top level: `activeImage.room_id`.

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

Update methods in `MapService`.

### 2b. Update construction sites

**`app.py` ~line 533** — session start ETL:
```python
restored_map = MapSettings(
    room_id=request.session_id,
    uploaded_by="system",
    map_config=map_config,  # contract passes through whole
)
```

**`websocket_events.py` ~line 1157** — DM loads map in-game.

### 2c. Update frontend reads

All `activeMap.field` becomes `activeMap.map_config.field`:

| File | Fields accessed |
|------|----------------|
| `app/game/components/MapControlsPanel.js` | `file_path`, `grid_config` |
| `app/game/GameContent.js` | `grid_config` |
| `app/map_management/components/MapDisplay.js` | `filename`, `file_path` |
| `app/map_management/components/MapImageEditor.js` | `file_path` |
| `app/game/hooks/webSocketEvent.js` | `grid_config`, `map_image_config`, `filename` |

---

## What's NOT changing

- **Shared contracts** — no changes, they already define the correct shapes
- **api-site** — no changes, domain and ETL are correct
- **AudioChannelState** — already IS the contract; the websocket handlers do incremental merge updates (`{**existing, "volume": new_value}`), which is a different pattern
- **GameSettings** — stores audio as plain dicts, separate concern
- **Workshop components** — workshop reads from api-site responses (MediaAssetResponse), not from api-game

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
| `api-game/imageservice.py` | Compose `ImageConfig`, update service methods |
| `api-game/mapservice.py` | Compose `MapConfig`, update service methods |
| `api-game/app.py` | Simplify session start restoration |
| `api-game/websocket_handlers/websocket_events.py` | Update image_load, map_load, config update handlers |
| `rollplay/app/map_management/components/ImageDisplay.js` | Nest image field reads under `image_config` |
| `rollplay/app/game/components/ImageControlsPanel.js` | Nest image field reads |
| `rollplay/app/game/components/ImageSelectionSection.js` | Nest image field reads |
| `rollplay/app/map_management/hooks/useImageWebSocket.js` | Nest image field reads |
| `rollplay/app/game/components/MapControlsPanel.js` | Nest map field reads under `map_config` |
| `rollplay/app/map_management/components/MapDisplay.js` | Nest map field reads |
| `rollplay/app/map_management/components/MapImageEditor.js` | Nest map field reads |
| `rollplay/app/game/hooks/webSocketEvent.js` | Nest map field reads |
| `rollplay/app/game/GameContent.js` | Nest map/image field reads |

---

## Verification

1. Session start ETL — image and map config fully restored with ALL fields including `cine_config.visual_overlays[].style`
2. In-game image load via IMAGE tab — all fields flow through, overlays render in cine mode
3. In-game map load — grid config preserved and functional
4. Display mode switching — cine overlays render/hide correctly
5. Image position nudging — position values preserved through ETL
6. Workshop save → session restart → game renders correctly (no field drift)
