# Motion & Cine Refactor — Dissolve cine_config + Compose Shared Contracts

---

## Part A: Dissolve cine_config — Separate Image Config, Display Mode, and Effects

### Context

`cine_config` conflates "cinematic effects" with "cine display mode." In reality:

- **Cine** is just a display mode that hides player UI. Nothing more.
- **Visual overlays** (film grain, color filter, bokeh, etc.) and **motion** (hand held) are image-level configuration — they should work regardless of display mode.

Currently, effects are locked behind `cine_config` which is locked behind `display_mode === 'cine'`. This forces cine + letterbox together and prevents effects on standard/float/wrap images.

### The New Model

| Concern | Field | Values | Notes |
|---------|-------|--------|-------|
| Image fit | `image_fit` | `float` / `wrap` / `letterbox` | How image fills the frame |
| Display mode | `display_mode` | `standard` / `cine` | `cine` = hide player UI |
| Aspect ratio | `aspect_ratio` | `2.39:1` etc. | Only meaningful for letterbox |
| Image position | `image_position_x/y` | 0–100 | Meaningful for letterbox + wrap |
| Visual overlays | `visual_overlays` | array | Direct on image_config |
| Motion | `motion` | object | Direct on image_config |

All orthogonal. `cine_config` wrapper is removed — its fields promote to `image_config`.

---

### Step 1 — Database Migration

**New file:** `api-site/alembic/versions/<new>_dissolve_cine_config.py`

```sql
-- Rename display_mode → image_fit
ALTER TABLE image_assets RENAME COLUMN display_mode TO image_fit;

-- Add new display_mode column (standard/cine)
ALTER TABLE image_assets ADD COLUMN display_mode VARCHAR(20) DEFAULT 'standard';

-- Migrate: old "cine" image_fit → letterbox + cine display_mode
UPDATE image_assets SET display_mode = 'cine', image_fit = 'letterbox' WHERE image_fit = 'cine';

-- Promote cine_config fields to top-level JSONB columns
ALTER TABLE image_assets ADD COLUMN visual_overlays JSONB;
ALTER TABLE image_assets ADD COLUMN motion JSONB;

-- Populate from existing cine_config
UPDATE image_assets
  SET visual_overlays = cine_config->'visual_overlays',
      motion = cine_config->'motion'
  WHERE cine_config IS NOT NULL;

-- Drop old column
ALTER TABLE image_assets DROP COLUMN cine_config;
```

### Step 2 — Backend Domain

**File:** `api-site/modules/library/domain/image_asset_aggregate.py`

- Rename `display_mode` → `image_fit`, add `VALID_IMAGE_FITS = {"float", "wrap", "letterbox"}`
- Add `display_mode` field with `VALID_DISPLAY_MODES = {"standard", "cine"}`
- Replace `cine_config: Optional[CineConfig]` with:
  - `visual_overlays: Optional[list] = None`
  - `motion: Optional[MotionConfig] = None`
- Aspect ratio clearing: `if image_fit != "letterbox": self.aspect_ratio = None`
- Update `build_image_config_for_game()` — pass visual_overlays and motion directly
- Update `from_base()`, `update_image_config()` — handle new fields

**File:** `api-site/modules/library/domain/cine_config.py`

- Remove `CineConfig` class entirely
- Keep `HandHeldMotion`, `MotionConfig` (still valid value objects)
- These are now used directly on the aggregate, not wrapped in CineConfig

### Step 3 — Database Model

**File:** `api-site/modules/library/model/image_asset_model.py`

- Rename `display_mode` column → `image_fit`
- Add `display_mode = Column(String(20), default="standard")`
- Replace `cine_config = Column(JSONB)` with:
  - `visual_overlays = Column(JSONB, nullable=True)`
  - `motion = Column(JSONB, nullable=True)`

### Step 4 — Repository

**File:** `api-site/modules/library/repositories/asset_repository.py`

- Save: serialize `visual_overlays` (list of overlay dicts) and `motion` (MotionConfig.to_dict()) separately
- Load: deserialize both from their own JSONB columns
- Remove all `CineConfig` import/usage

### Step 5 — Shared Contracts

**File:** `rollplay-shared-contracts/shared_contracts/image.py`

- Rename `display_mode` → `image_fit: str = "float"`
- Add `display_mode: str = "standard"`
- Replace `cine_config: Optional[CineConfig] = None` with:
  - `visual_overlays: Optional[List[VisualOverlay]] = None`
  - `motion: Optional[MotionConfig] = None`

**File:** `rollplay-shared-contracts/shared_contracts/cine.py`

- Remove `CineConfig` class
- Keep `FilmGrainOverlay`, `ColorFilterOverlay`, `VisualOverlay`, `HandHeldMotion`, `MotionConfig`
- These are still valid contract types, just no longer wrapped

### Step 6 — API Schemas + Commands + Endpoints

**File:** `api-site/modules/library/api/schemas.py`

- `UpdateImageConfigRequest`: rename `display_mode` → `image_fit`, add `display_mode`, replace `cine_config` with `visual_overlays` + `motion`
- `MediaAssetResponse`: same field changes

**File:** `api-site/modules/library/application/commands.py`

- `UpdateImageConfig`: handle `image_fit`, `display_mode`, `visual_overlays`, `motion` as separate params with UNSET sentinels where needed
- Remove `CineConfig` domain import and validation wrapper

**File:** `api-site/modules/library/api/endpoints.py`

- Update response building to serialize visual_overlays and motion directly
- Update PATCH handler for new field names

### Step 7 — api-game

**File:** `api-game/imageservice.py`

- Merge logic: rename `display_mode` → `image_fit` references, add `display_mode`
- Remove cine_config merge — merge `visual_overlays` and `motion` directly (or better: don't merge them, they're workshop-authored)
- Aspect ratio clearing: `image_fit != "letterbox"`

**File:** `api-game/websocket_handlers/websocket_events.py`

- `image_load`: read `image_fit`, `display_mode`, `visual_overlays`, `motion` from incoming data
- `image_config_update`: handle `image_fit` and `display_mode` separately

### Step 8 — Frontend: ImageDisplay

**File:** `rollplay/app/map_management/components/ImageDisplay.js`

- Read `image_fit` instead of `display_mode` for layout: `const imageFit = ic?.image_fit || 'float'`
- Legacy fallback: `ic?.image_fit === 'cine' ? 'letterbox' : ...` or `ic?.display_mode` as old field name
- `isLetterbox = imageFit === 'letterbox'`
- Hand held: `const handHeld = ic?.motion?.hand_held || null` (no cine gate)
- Overlay URLs: `ic?.visual_overlays` (no cine gate)
- Render overlays: `{ic?.visual_overlays && renderVisualOverlays(ic)}` — pass ic directly, update `renderVisualOverlays` to read `ic.visual_overlays`
- Motion wrapper renders in BOTH letterbox and non-letterbox branches when motion/overlays exist

### Step 9 — Frontend: Workshop Controls

**File:** `rollplay/app/workshop/components/ImageDisplayControls.js`

- Rename "Display Mode" section → "Image Fit" with float/wrap/letterbox
- Add "Display Mode" section: Standard / Cine toggle
- Effects section (overlays + motion): always available, not gated on cine
- Read/write `visual_overlays` and `motion` directly instead of nesting in `cineConfig`
- Props change: `cineConfig` / `onCineConfigChange` → `visualOverlays` / `onVisualOverlaysChange` + `motion` / `onMotionChange` + `displayMode` / `onDisplayModeChange`

**File:** `rollplay/app/workshop/components/ImageConfigTool.js`

- Replace `cineConfig` state with: `visualOverlays`, `motion`, `displayMode`
- Add `imageFit` state (renamed from `displayMode`)
- Preview builds: `image_fit`, `display_mode`, `visual_overlays`, `motion`
- Save sends all fields separately

### Step 10 — Frontend: Game Runtime

**File:** `rollplay/app/game/components/ImageControlsPanel.js`

- Remove `cine` from DISPLAY_MODES → becomes image fit selector (float/wrap/letterbox)
- Add display mode toggle: Standard / Cine
- Aspect ratio guards: `imageFit === 'letterbox'`
- Position guards: `imageFit === 'letterbox' || imageFit === 'wrap'`

**File:** `rollplay/app/game/GameContent.js`

- UI hiding: `activeImage?.image_config?.display_mode === 'cine' && isPlayer`

### Step 11 — Frontend: Hooks + Manifest

**File:** `rollplay/app/map_management/hooks/useCameraMotion.js`

- Update JSDoc: param is now `image_config.motion.hand_held`

**File:** `rollplay/app/game/cineManifest.js`

- No changes needed (just static asset paths)

### Step 12 — Contract Tests

**File:** `rollplay-shared-contracts/tests/test_contracts.py`

- Remove CineConfig import, add direct overlay/motion imports
- Update ImageConfig round-trip tests: use `image_fit`, `display_mode`, `visual_overlays`, `motion`
- Remove CineConfig-specific test class
- Add tests for legacy `"cine"` value coercion

---

### Part A Verification

1. **Workshop**: Image fit selector (float/wrap/letterbox) independent of effects
2. **Workshop**: Display mode toggle (standard/cine) independent of fit and effects
3. **Workshop**: Add overlays + motion to a float image → effects render in preview
4. **Workshop**: Save → reload → all fields restored correctly
5. **Game**: Effects render regardless of display mode or image fit
6. **Game**: Cine display mode hides player UI, standard does not
7. **Game**: DM can change fit and display mode independently at runtime
8. **Legacy data**: Old `display_mode: "cine"` + `cine_config` records work after migration
9. **Contract tests**: `cd rollplay-shared-contracts && pytest tests/test_contracts.py -v`

### Part A File Summary

| File | Change |
|------|--------|
| `api-site/alembic/versions/<new>.py` | **New** — migration: rename column, add columns, promote fields, drop cine_config |
| `api-site/modules/library/domain/image_asset_aggregate.py` | Rename field, add display_mode, dissolve cine_config |
| `api-site/modules/library/domain/cine_config.py` | Remove CineConfig class, keep MotionConfig + HandHeldMotion |
| `api-site/modules/library/model/image_asset_model.py` | Rename column, add columns, drop cine_config |
| `api-site/modules/library/repositories/asset_repository.py` | Serialize/deserialize new fields |
| `api-site/modules/library/api/schemas.py` | Update request/response schemas |
| `api-site/modules/library/application/commands.py` | Handle new fields, remove CineConfig wrapper |
| `api-site/modules/library/api/endpoints.py` | Update field handling |
| `rollplay-shared-contracts/shared_contracts/image.py` | Rename field, add field, promote nested fields |
| `rollplay-shared-contracts/shared_contracts/cine.py` | Remove CineConfig, keep overlay + motion types |
| `rollplay-shared-contracts/tests/test_contracts.py` | Update all tests |
| `api-game/imageservice.py` | Rename fields, remove cine_config merge |
| `api-game/websocket_handlers/websocket_events.py` | Rename fields |
| `rollplay/app/map_management/components/ImageDisplay.js` | Use image_fit for layout, read overlays/motion directly |
| `rollplay/app/workshop/components/ImageDisplayControls.js` | Split into image fit + display mode + effects sections |
| `rollplay/app/workshop/components/ImageConfigTool.js` | Split state, update preview/save |
| `rollplay/app/game/components/ImageControlsPanel.js` | Split selectors, remove cine from fit list |
| `rollplay/app/game/GameContent.js` | UI hiding checks display_mode === 'cine' |
| `rollplay/app/map_management/hooks/useCameraMotion.js` | Update JSDoc |

---

## Part B: Compose Shared Contracts Instead of Duplicating Fields

### Context

api-game's local models (`ImageSettings`, `MapSettings`) duplicate fields from shared contracts (`ImageConfig`, `MapConfig`) and add game-specific metadata (`room_id`, `loaded_by`, `active`). Construction sites manually map fields one-by-one, causing the same drift bug 4+ times — most recently `cine_config.style` being silently dropped.

The fix: **compose the contract** inside the local model. The contract arrives whole, gets stored whole in MongoDB, and the frontend reads the same nested shape. One shape everywhere, no translation layers, no drift.

---

### Phase 1: ImageSettings composes ImageConfig

#### 1a. Refactor ImageSettings model

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

#### 1b. Update construction sites

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

#### 1c. Update frontend reads

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

### Phase 2: MapSettings composes MapConfig

#### 2a. Refactor MapSettings model

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

#### 2b. Update construction sites

**`app.py` ~line 533** — session start ETL:
```python
restored_map = MapSettings(
    room_id=request.session_id,
    uploaded_by="system",
    map_config=map_config,  # contract passes through whole
)
```

**`websocket_events.py` ~line 1157** — DM loads map in-game.

#### 2c. Update frontend reads

All `activeMap.field` becomes `activeMap.map_config.field`:

| File | Fields accessed |
|------|----------------|
| `app/game/components/MapControlsPanel.js` | `file_path`, `grid_config` |
| `app/game/GameContent.js` | `grid_config` |
| `app/map_management/components/MapDisplay.js` | `filename`, `file_path` |
| `app/map_management/components/MapImageEditor.js` | `file_path` |
| `app/game/hooks/webSocketEvent.js` | `grid_config`, `map_image_config`, `filename` |

---

### What's NOT changing

- **Shared contracts** — no changes, they already define the correct shapes
- **api-site** — no changes, domain and ETL are correct
- **AudioChannelState** — already IS the contract; the websocket handlers do incremental merge updates (`{**existing, "volume": new_value}`), which is a different pattern
- **GameSettings** — stores audio as plain dicts, separate concern
- **Workshop components** — workshop reads from api-site responses (MediaAssetResponse), not from api-game

---

### MongoDB Document Shape (after both parts)

```json
{
  "room_id": "session-123",
  "loaded_by": "system",
  "active": true,
  "image_config": {
    "asset_id": "img-1",
    "filename": "tavern.jpg",
    "file_path": "https://s3...",
    "image_fit": "letterbox",
    "display_mode": "cine",
    "aspect_ratio": "2.39:1",
    "image_position_x": 30.0,
    "image_position_y": 70.0,
    "visual_overlays": [{ "type": "film_grain", "style": "vintage", "opacity": 0.5, "blend_mode": "overlay" }],
    "motion": { "hand_held": { "enabled": true, "track_points": 4, "distance": 10, "speed": 3, "x_bias": 0, "randomness": 0 } }
  }
}
```

Same shape in MongoDB, websocket broadcast, and frontend state.

---

### Part B File Summary

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

### Part B Verification

1. Session start ETL — image and map config fully restored with ALL fields including `visual_overlays[].style`
2. In-game image load via IMAGE tab — all fields flow through, overlays render
3. In-game map load — grid config preserved and functional
4. Display mode switching — cine overlays render/hide correctly
5. Image position nudging — position values preserved through ETL
6. Workshop save → session restart → game renders correctly (no field drift)
