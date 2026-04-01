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

---

## Sub-Plan A: Cine Mode — Cinematic Image Display

> *Refined during implementation. Originally a standalone plan for the full cinematic feature.*

### Context

Cine mode transforms the image display from a simple tool into an interactive storytelling experience with:
- **Entrance transitions** — how the image appears (fade, slide, zoom, etc.)
- **Ken Burns motion** — slow pan + zoom across a still image
- **Text overlays** — animated text appearing over the image
- **Visual overlays** — effects layered on top of the image
- **UI hiding** — hides game UI for PLAYER roles (wiring already in GameContent.js)

### Key Architectural Decisions

**Cine config is workshop-authored, game-read-only:**
- **Workshop** creates and edits `cine_config` on the image asset in PostgreSQL
- **Session start ETL** sends `cine_config` to api-game/MongoDB (read-only copy)
- **In-game** the DM selects "Cine" as display mode → `CineDisplay` reads the config
- **Session end ETL** does NOT write `cine_config` back — it's never mutated at runtime

**Cine button disabled without config:**
In the game IMAGE drawer, the "Cine" mode button is visible but **disabled** when the asset has no `cine_config`. Clear UX signal that this asset needs workshop configuration first.

### Animation Library Decision

**GSAP (`gsap` + `@gsap/react`)** for Ken Burns + text animations:
- Timeline-based orchestration — sequence entrance → ken burns → text
- Ken Burns is a coordinated `scale` + `x`/`y` tween
- `useGSAP()` hook handles React lifecycle/cleanup
- Performant — GPU-accelerated transforms

**Animate.css** for entrance transitions:
- Pre-built CSS classes (fadeIn, slideInUp, zoomIn, etc.)
- 4KB, zero JS overhead — just toggle a class
- Config stores effect names, frontend maps to Animate.css classes

### Config Shape

Config describes **what** to do, not **how**. The rendering layer (`CineDisplay`) decides which library handles each feature.

```javascript
// cine_config — stored as JSONB on the image asset, read-only at runtime
{
  transition: {
    effect: "fadeIn",
    duration: 1.5,
    delay: 0,
  },
  ken_burns: {
    enabled: true,
    duration: 12,
    start: { x: 0, y: 0, scale: 1.0 },
    end: { x: -5, y: -3, scale: 1.3 },
    easing: "power1.inOut",
  },
  text_overlays: [
    {
      text: "The kingdom falls silent...",
      position: "bottom-center",
      style: "subtitle",
      animation: "fadeUp",
      delay: 2.0,
      duration: null,
    }
  ],
  visual_overlays: [...],
  hide_player_ui: true,
}
```

### Frontend Component Layer Model

```
Transition wrapper (entrance/exit — animates EVERYTHING as one unit)
  ├── Text overlays (z-15 — above letterbox, never clipped by bars)
  └── Letterbox container (aspect-ratio, black bars)
      └── Ken Burns wrapper (GSAP scale + translate within the frame)
          ├── Visual overlays (z-10 — pan/zoom with the image)
          └── <img object-fit:cover object-position:X% Y%> ← nudge/reframe
```

### Implementation Order

1. **Install dependencies** — `npm install gsap @gsap/react animate.css`
2. **Config schema** — add `cine_config` JSONB column + migration
3. **Backend plumbing** — contract, aggregate, repository, ETL (read-only semantics)
4. **ImageControlsPanel** — add Cine button (disabled without config)
5. **CineDisplay component** — entrance transition + Ken Burns + text overlays
6. **cineHideUI activation** — flip the flag for player role hiding
7. **Workshop Image Config tool** — cine configuration editor

---

## Sub-Plan B: Structured CineConfig Schema + Visual Overlays

> *Refined during implementation. Originally a standalone plan for typing cine_config and implementing the first overlay feature.*

### Context

`cine_config` was stored as `Dict[str, Any]` everywhere. This plan structures it into typed models and implements visual overlays as the first real cine feature.

Visual overlays use a **typed + stacked** model: each overlay is a single effect type (`film_grain`, `color_filter`), and you combine by stacking multiple entries in the list. Array order = render order.

### Phase 1: Shared Contract — CineConfig + VisualOverlay

**New file: `rollplay-shared-contracts/shared_contracts/cine.py`**

```python
class FilmGrainOverlay(ContractModel):
    type: Literal["film_grain"] = "film_grain"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    style: str = "vintage"
    blend_mode: str = "overlay"

class ColorFilterOverlay(ContractModel):
    type: Literal["color_filter"] = "color_filter"
    enabled: bool = True
    opacity: float = Field(default=0.5, ge=0.0, le=1.0)
    color: str = "#1a0a2e"
    blend_mode: str = "multiply"

VisualOverlay = Annotated[Union[FilmGrainOverlay, ColorFilterOverlay], Field(discriminator="type")]

class CineConfig(ContractModel):
    visual_overlays: List[VisualOverlay] = []
    hide_player_ui: bool = True
    transition: Optional[Any] = None
    ken_burns: Optional[Any] = None
    text_overlays: Optional[Any] = None
```

### Phase 2: Domain + Commands (api-site)

- Domain `CineConfig` dataclass with overlay stack management (add, remove, reorder, validate)
- Domain overlay types (`FilmGrainOverlay`, `ColorFilterOverlay`) with blend mode / style validation
- `UpdateImageConfig` command accepts typed `CineConfig`

### Phase 3: API Schemas

- `MediaAssetResponse` and `UpdateImageConfigRequest` use typed `CineConfig` instead of `Dict`

### Phase 4: Repository Serialization

- On write: `aggregate.cine_config.to_dict()` for JSONB
- On read: `CineConfig.from_dict(model.cine_config)` with try/except for backwards compat

### Phase 5: api-game — No changes needed

api-game treats cine_config as an opaque blob — stores/returns it, never interprets it.

### Phase 6: Workshop UI — Visual Overlay Editor

- "Add Overlay" button with type picker (Film Grain, Color Filter)
- Per-overlay card: type label, enabled toggle, opacity slider, type-specific controls, remove button
- Up/down arrows for reorder

### Phase 7: Game-time Overlay Rendering

Render visual overlays at the reserved z-index slots:
- `film_grain`: `background-image: url(/cine/overlay/film-grain.gif)`, `mix-blend-mode: overlay`
- `color_filter`: `background-color` + `mix-blend-mode` from config
- Each overlay's `opacity` applied via CSS

### Verification

1. Contract round-trip + constraint tests for CineConfig/VisualOverlay
2. PATCH with `cine_config` containing visual_overlays — verify 200
3. Invalid overlay (opacity > 1.0) — verify 422
4. Workshop: add film grain overlay → adjust opacity → save → reload → persists
5. Workshop preview: overlays visible in real-time
6. Game rendering: overlays render correctly over image in cine mode
7. Backwards compat: images with null cine_config still work

---

## Sub-Plan C: api-game — Compose Shared Contracts

> *Refined during implementation. Originally a standalone plan created after repeated field-drift bugs.*

### Context

api-game's local models (`ImageSettings`, `MapSettings`) duplicate fields from shared contracts (`ImageConfig`, `MapConfig`) and add game-specific metadata (`room_id`, `loaded_by`, `active`). Construction sites manually map fields one-by-one, causing the same drift bug 4+ times — most recently `cine_config.style` being silently dropped.

The fix: **compose the contract** inside the local model. The contract arrives whole, gets stored whole in MongoDB, and the frontend reads the same nested shape. One shape everywhere, no translation layers, no drift.

### Phase 1: ImageSettings composes ImageConfig

```python
class ImageSettings(BaseModel):
    room_id: str
    loaded_by: str
    active: bool = True
    image_config: ImageConfig  # the whole contract
```

Update all service methods, backend construction sites, frontend construction + read sites to use nested paths (`image_config.field` instead of flat `field`).

### Phase 2: MapSettings composes MapConfig

```python
class MapSettings(BaseModel):
    room_id: str
    uploaded_by: str
    active: bool = True
    map_config: MapConfig  # the whole contract
```

Same pattern — update service methods, construction sites, frontend reads.

### MongoDB Document Shape (after)

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
    "cine_config": { "visual_overlays": [...], "hide_player_ui": true }
  }
}
```

### What's NOT changing

- Shared contracts — no changes, already correct
- api-site — no changes, domain and ETL are correct
- AudioChannelState — already IS the contract
- Config update broadcast shape — broadcasts remain flat deltas
