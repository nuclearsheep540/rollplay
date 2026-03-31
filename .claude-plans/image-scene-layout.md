# Image Scene Layout — Display Modes (Float / Wrap / Cine)

## Context

Images in the game view are currently "plopped in the center" with `object-fit: contain` and no config. Maps have grid config, audio has volume/effects config — both stored on the **asset** in PostgreSQL, flowed through shared contracts via ETL, and configurable in the workshop. Image display mode needs to follow this same asset-config pattern.

This adds three display modes: **float** (current), **wrap** (fill viewport), and **cine** (letterboxed + UI hiding for players).

---

## Layer 1 — Shared Contracts

**File:** `rollplay-shared-contracts/shared_contracts/image.py`

Add display config fields to `ImageConfig`:
```python
class ImageConfig(ContractModel):
    asset_id: str
    filename: str
    original_filename: Optional[str] = None
    file_path: str
    display_mode: str = "float"            # "float" | "wrap" | "cine"
    aspect_ratio: Optional[str] = None     # "2.39:1", "16:9", etc. — only for cine
```

Defaults ensure backwards compat — existing data that lacks these fields deserializes as float.

---

## Layer 2 — PostgreSQL Asset Storage (api-site)

### 2a. Model — `api-site/modules/library/model/image_asset_model.py`

Switch from single-table inheritance to **joined table inheritance** (matching `MapAssetModel`):
```
image_assets table:
  id (FK → media_assets.id)
  display_mode VARCHAR(20) nullable    — "float" | "wrap" | "cine"
  aspect_ratio VARCHAR(20) nullable    — "2.39:1", "16:9", "1.85:1", "4:3", "1:1"
```

### 2b. Domain — `api-site/modules/library/domain/image_asset_aggregate.py`

Add fields + methods following the MapAsset pattern:
- `display_mode: Optional[str] = None`
- `aspect_ratio: Optional[str] = None`
- `update_image_config(display_mode, aspect_ratio)` — validates values
- `has_image_config() -> bool`
- `build_image_config_for_game(asset_id, filename, file_path) -> ImageConfig` — builds contract with config fields
- `update_image_config_from_game(display_mode, aspect_ratio)` — inverse for hot→cold sync
- Update `from_base()` to accept the new fields

### 2c. Repository — `api-site/modules/library/repositories/asset_repository.py`

Update the query that loads image assets to join `image_assets` table and pass `display_mode`/`aspect_ratio` to `ImageAsset.from_base()`.

### 2d. API Schema — `api-site/modules/library/api/schemas.py`

Add `ImageAssetResponse` with `display_mode` and `aspect_ratio` fields (or extend existing response).

### 2e. API Endpoint — `api-site/modules/library/api/endpoints.py`

Add `PATCH /assets/{asset_id}/image-config` endpoint (matching `PATCH /assets/{asset_id}/grid` and `PATCH /assets/{asset_id}/audio-config`):
- Request schema: `UpdateImageConfigRequest(display_mode, aspect_ratio)`
- Command: `UpdateImageConfig` in `commands.py`
- Blocks updates if asset is in active session (`AssetInUseError`)

### 2f. Alembic Migration

`alembic revision --autogenerate -m "add image_assets joined table for display config"`

Import `ImageAssetModel` in `alembic/env.py`.

---

## Layer 3 — Session ETL

### 3a. Session Start (cold → hot)

**File:** `api-site/modules/session/application/commands.py` → `_restore_image_config()`

Currently builds `ImageConfig(asset_id, filename, file_path)`. Add:
```python
display_mode=image_asset.display_mode or "float",
aspect_ratio=image_asset.aspect_ratio,
```

### 3b. Session End (hot → cold)

**File:** `api-site/modules/session/application/commands.py` → `_extract_and_sync_game_state()`

Currently stores only `{"asset_id": ...}`. Add:
```python
image_config = {
    "asset_id": final_state.image_state.asset_id,
    "display_mode": final_state.image_state.display_mode,
    "aspect_ratio": final_state.image_state.aspect_ratio,
}
```

Also sync config back to the asset (like map grid sync):
```python
if isinstance(image_asset, ImageAsset):
    image_asset.update_image_config_from_game(
        display_mode=final_state.image_state.display_mode,
        aspect_ratio=final_state.image_state.aspect_ratio,
    )
```

---

## Layer 4 — Game Service (api-game)

### 4a. ImageSettings model — `api-game/imageservice.py`

Add fields with defaults:
```python
display_mode: str = "float"
aspect_ratio: Optional[str] = None
```

No migration needed — Pydantic defaults handle existing MongoDB documents.

### 4b. ImageService — new method

Add `update_image_config(room_id, display_mode, aspect_ratio)` — updates only config fields on the active image document in MongoDB (matching `map_service.update_map_config()`).

### 4c. WebSocket events — `api-game/websocket_handlers/websocket_events.py`

**`image_load` handler** — pull new fields from `image_data`:
```python
display_mode=image_data.get("display_mode", "float"),
aspect_ratio=image_data.get("aspect_ratio"),
```

**New `image_config_update` handler** — lightweight config-only update (matching `map_config_update` pattern):
- Receives `display_mode` and `aspect_ratio` from frontend
- Calls `image_service.update_image_config(room_id, display_mode, aspect_ratio)`
- Broadcasts `image_config_update` event to all clients
- Does NOT re-save the full image document — only updates config fields

This keeps mode changes lightweight and follows the same split as map: `map_load` for loading a new map, `map_config_update` for changing config on the current map.

**`image_request` handler** — no changes needed (returns saved doc which includes new fields).

---

## Layer 5 — Frontend

### 5a. ImageDisplay — `rollplay/app/map_management/components/ImageDisplay.js`

Read `activeImage.display_mode` (default `"float"`) and `activeImage.aspect_ratio`. Render three modes with explicit z-index layering:

**Existing Game Page Z-Index Map:**
```
z-[102]: Fullscreen image overlay (GameContent)
z-[100]: DiceActionPanel (fixed, bottom center)
z-50:    Modals, dropdowns, tooltips, toasts (shared components)
z-30:    MapSafeArea, initiative tracker tooltips
z-20:    Loading overlays, grid overlay (edit mode), initiative hover
z-10:    Initiative tracker, grid overlay (display mode)
z-5:     GridOverlay (display mode)
z-1:     MapDisplay / ImageDisplay base container
```

ImageDisplay currently uses `zIndex: 1` for its container and `zIndex: 20` for its loading indicator. All image scene layers must stay **below z-30** (game UI starts there) so drawers, dice panel, initiative, and modals render on top.

**ImageDisplay Z-Index Stack (internal layers, all < z-30):**
```
z-25: Letterbox bars (cine mode) — must be above overlays but below game UI
z-20: Loading indicator (existing)
z-15: [Reserved — text overlays, captions, workshop-configured text layers]
z-10: [Reserved — visual overlay effects, workshop-configured image effects]
z-5:  [Reserved — additional overlay slot]
z-1:  Image layer
z-0:  Background fill (#1a1a2e for float/wrap, #000 for cine)
```

Letterbox bars sit at z-25 so they're above ALL overlay/text layers but below game UI (z-30+). This gives us 3 reserved slots (z-5, z-10, z-15) for future workshop-configured overlays and text, all visible "within" the cinematic frame.

**Float mode** (current): `object-fit: contain`, centered, dark bg — no changes

**Wrap mode**: `object-fit: cover`, `width: 100%`, `height: 100%` — fills viewport, crops edges

**Cine mode**: Use **explicit bar overlays** — four absolutely-positioned black `<div>`s at z-25, dimensions calculated from viewport size and chosen aspect ratio. Image renders at z-1. This approach (vs CSS aspect-ratio on a container) gives us precise z-index control so overlay layers slot in cleanly between image and bars.

Aspect ratio presets for cine:
| Label | Value | CSS aspect-ratio |
|-------|-------|-----------------|
| Ultrawide | `"2.39:1"` | `2.39 / 1` |
| Widescreen | `"1.85:1"` | `1.85 / 1` |
| HD | `"16:9"` | `16 / 9` |
| Classic | `"4:3"` | `4 / 3` |
| Square | `"1:1"` | `1 / 1` |

### 5b. ImageControlsPanel — `rollplay/app/game/components/ImageControlsPanel.js`

Currently has: image selection section (collapsible) and a "Clear Image" button. No config controls.

**New props needed:**
- `sendImageConfigUpdate` — from useImageWebSocket, sends `image_config_update` event

**Add a "Display Settings" collapsible section** (rendered between image selection and clear button, only when `activeImage` is not null):

```
📁 Hide Images / Load Image        ← existing collapsible
   [image selection grid]           ← existing

🎬 Display Settings                 ← NEW collapsible section
   ┌─────────────────────────────┐
   │  Mode:                      │
   │  [Float] [Wrap] [Cine]      │  ← segmented control (DM_CHILD buttons)
   │                             │
   │  Aspect Ratio:              │  ← only shown when mode === "cine"
   │  [2.39:1] [1.85:1] [16:9]  │
   │  [4:3]    [1:1]             │  ← preset buttons
   └─────────────────────────────┘

🗑️ Clear Image                     ← existing
```

**Behavior:**
- `isDisplayExpanded` state controls the collapsible, default `true`
- Display mode reads from `activeImage.display_mode || "float"`
- On mode button click: call `sendImageConfigUpdate({ display_mode: newMode, aspect_ratio })` 
- On aspect ratio button click: call `sendImageConfigUpdate({ display_mode: 'cine', aspect_ratio: newRatio })`
- If switching away from cine, clear aspect_ratio (send `null`)
- Uses `DM_CHILD` / `ACTIVE_BACKGROUND` constants for styling consistency with existing panel controls
- Mode change is instant — fires WebSocket event immediately, no "apply" button needed (matches how map grid opacity/color changes broadcast immediately during edit)

### 5c. useImageWebSocket — `rollplay/app/map_management/hooks/useImageWebSocket.js`

Add:
- `sendImageConfigUpdate({ display_mode, aspect_ratio })` — sends `image_config_update` event
- `handleImageConfigUpdate` handler — merges new config fields into existing `activeImage` state (same pattern as `map_config_update` handler merges into `activeMap`)

### 5d. GameContent — `rollplay/app/game/GameContent.js`

Derive a `cineHideUI` flag:
```javascript
const isPlayer = !isDM && !isModerator && !isSpectator;
const cineHideUI = activeDisplay === 'image'
  && activeImage?.display_mode === 'cine'
  && isPlayer;
```

When `cineHideUI` is true, hide:
- Left drawer (party + log) — conditional render `{!cineHideUI && (...)}`
- Right drawer — conditional render (already role-gated for DM tabs, but hide entirely for players)
- DiceActionPanel — add `&& !cineHideUI` to visibility condition
- HorizontalInitiativeTracker — conditional render

**Keep visible for all roles:** Top navigation bar (always)

**DM sees:** Letterbox framing (via ImageDisplay) but all UI controls remain. The `cineHideUI` flag is false for DM since `isDM` is true.

**Moderators/Spectators:** Unaffected — `isPlayer` is false for both.

Register `image_config_update` handler in WebSocket event routing.

---

## Implementation Order

1. **Shared contracts** — add fields to `ImageConfig` (safe: defaults)
2. **PostgreSQL model + migration** — `image_assets` joined table
3. **Domain aggregate** — `ImageAsset` fields + methods
4. **Repository** — join query for image assets
5. **API endpoint** — `PATCH /assets/{asset_id}/image-config`
6. **Session ETL** — update `_restore_image_config` and `_extract_and_sync_game_state`
7. **api-game ImageSettings + ImageService** — add fields, add `update_image_config()`
8. **api-game WebSocket** — update `image_load` handler, add `image_config_update` handler
9. **Frontend useImageWebSocket** — add `sendImageConfigUpdate` + handler
10. **Frontend ImageDisplay** — three rendering modes with z-index layering
11. **Frontend ImageControlsPanel** — DM mode selector UI
12. **Frontend GameContent** — cine UI hiding logic + event routing

---

## Verification

1. **Float mode**: Load image in game → renders centered with `contain` (unchanged behavior)
2. **Wrap mode**: Switch to wrap → image fills viewport with `cover`, edges cropped
3. **Cine mode**: Switch to cine, pick aspect ratio → letterbox bars appear, image constrained to ratio
4. **Cine UI hiding**: As PLAYER role, confirm drawers/dice/initiative hidden; as DM, confirm all UI remains
5. **Config persistence via ETL**: Pause session, resume → image config restored from asset in PostgreSQL
6. **Config sync on session end**: Change mode in-game, finish session → asset in PostgreSQL updated
7. **Late join**: New player joins mid-session → receives correct display mode via `image_request`
8. **Workshop readiness**: `PATCH /assets/{id}/image-config` works from API — ready for workshop tool
9. **Backwards compat**: Existing images with no config default to float
10. **Z-index**: Verify letterbox bars render above image layer with z-5 gap reserved for overlays
