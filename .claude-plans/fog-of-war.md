# Fog of War — Map Mask Overlay & Painting Tool

## Context

Highly-requested feature: DMs need a "fog of war" overlay on maps so players only see explored areas. Currently maps render as image + grid only.

**Design decisions reached during discussion:**

1. **Bitmap PNG with alpha channel** as the storage/transport format (Option C). PNG natively supports per-pixel alpha, so erase = `globalCompositeOperation: 'destination-out'` cuts real transparent holes. DMs can paint, erase, soft-feather, partial-alpha — all in a single mask.

2. **Inline base64 in WebSocket payload** — no S3 round trip. A typical 1-bit/8-bit alpha PNG at 25–50% map resolution compresses to ~10–80KB, comfortably within a single WS frame. Eliminates the slow-internet flicker risk of "fetch from S3 between updates" entirely.

3. **`fog_config` as a sibling of `grid_config`** on the map asset, not nested inside it. Stored as JSONB (vs grid's flat columns) because the payload is a single base64 string + small metadata.

4. **Atomic full-replace on update** — DM clicks "Update", the entire mask replaces the previous one. No partial diffs, no stroke history. Per the codebase's atomic-state-update rule.

5. **No-flicker guarantee** — receive event → decode new image in memory → swap onto canvas only after decode completes. Old fog stays visible until the new one is ready.

6. **Decoupled `fog_management/` module**, modelled on `audio_management/`: a pure-JS `FogEngine` class, a `useFogEngine` React hook, and a `fogWebSocketEvents.js` handler set. Same module consumed by **both** the game runtime DM panel and the workshop map editor.

7. **Mask shape is alpha-channel pixels, not geometry.** `mask_width × mask_height` are just the rectangular bounds of the canvas; complex fog shapes (holes, disconnected blobs, soft edges) emerge naturally from per-pixel alpha values inside that rectangle. No vector / polygon contract needed.

---

## Architecture Overview

```
                       ┌───────────────────────────────┐
                       │  fog_management/  (frontend)  │
                       │  ─────────────────────────────│
                       │   FogEngine  (pure JS class)  │
                       │     • owns persistent canvas  │
                       │     • paint / erase / clear   │
                       │     • brush size + mode       │
                       │     • emit('change')          │
                       │     • toDataURL() / load()    │
                       │   useFogEngine()  hook        │
                       │   FogPaintControls  component │
                       │   fogWebSocketEvents.js       │
                       └───────────────────────────────┘
                            ▲                      ▲
                            │                      │
                ┌───────────┴────────┐  ┌──────────┴──────────┐
                │ Game runtime (DM)  │  │ Workshop (FogTool)  │
                │ MapControlsPanel   │  │ FogMaskTool page    │
                │ → WS broadcast     │  │ → REST PATCH        │
                └────────────────────┘  └─────────────────────┘
                            │                      │
                            ▼                      ▼
                   api-game (MongoDB)        api-site (PSQL)
                            │                      │
                            └──── ETL on start/end ┘
```

---

## Backend Changes

### 1. `rollplay-shared-contracts` — new `FogConfig`

**File:** `rollplay-shared-contracts/shared_contracts/map.py`

```python
class FogConfig(ContractModel):
    """Fog of war mask for a map.

    The mask is a base64-encoded PNG data URL (with the
    `data:image/png;base64,` prefix). Alpha channel is meaningful:
    opaque pixels are fog, transparent pixels are revealed. The
    shape of the fog (holes, disconnected regions, soft edges) is
    entirely encoded in the alpha pattern — mask_width/mask_height
    are just the rectangular bounds of the bitmap.
    """

    mask: Optional[str] = Field(default=None, min_length=1)  # data URL
    mask_width: Optional[int] = Field(default=None, ge=1)
    mask_height: Optional[int] = Field(default=None, ge=1)
    version: int = 1
```

Add `fog_config: Optional[FogConfig] = None` to `MapConfig`. Export from `__init__.py`. Add round-trip + defaults + map-with-fog tests to `tests/test_contracts.py`.

### 2. `api-site` — MapAsset persistence

- **Model** (`map_asset_model.py`): add `fog_config = Column(JSONB, nullable=True)` (single column — payload is one large opaque string).
- **Aggregate** (`map_asset_aggregate.py`): add `fog_config: Optional[Dict[str, Any]]` field plus `update_fog_config(...)`, `get_fog_config()`, `build_fog_config_for_game()`, `update_fog_config_from_game()` mirroring grid's methods.
- **Command** (`application/commands.py`): add `UpdateFogConfig` parallel to `UpdateGridConfig`.
- **Schemas** (`api/schemas.py`): add `UpdateFogConfigRequest`; add `fog_config: Optional[dict]` to `MediaAssetResponse`.
- **Endpoint** (`api/endpoints.py`): add `PATCH /api/library/{asset_id}/fog`. 409 if map is in active session.
- **Migration**: `docker exec api-site-dev alembic revision --autogenerate -m "add fog_config to map_assets"` (autogen only, never hand-written).

### 3. `api-game` — MongoDB shape & WebSocket

- `mapservice.py`: add `update_fog_config(room_id, fog_config)` method using `$set` dot-notation pattern like `update_map_config`.
- `websocket_handlers/websocket_events.py`: add `fog_config_update` handler — receive payload, persist via service, return broadcast `WebsocketEventResult`.
- `websocket_handlers/app_websocket.py`: add dispatch case for `'fog_config_update'`.

### 4. ETL — Session start / end

- `api-site/modules/session/application/commands.py` `_restore_map_config`: include `fog_config=map_asset.build_fog_config_for_game()` in the `MapConfig` constructor.
- `StopSession`/`EndSession`: call `map_asset.update_fog_config_from_game(...)` before saving.

---

## Frontend Changes

### 5. New module: `rollplay/app/fog_management/`

Modelled on `rollplay/app/audio_management/`. Reuses the EventEmitter pattern from `audio_management/engine/EventEmitter.js`.

```
fog_management/
├── index.js
├── engine/
│   ├── FogEngine.js       # Pure JS, owns canvas, paint/erase
│   ├── EventEmitter.js    # Copy of audio_management's
│   └── index.js
├── hooks/
│   ├── useFogEngine.js    # React wrapper
│   ├── fogWebSocketEvents.js
│   └── index.js
└── components/
    ├── FogCanvasLayer.js  # Mounts the engine canvas at the right z-layer
    ├── FogPaintControls.js
    └── index.js
```

**`FogEngine`** (pure JS, no React, no WebSocket):
- `new FogEngine({ width, height })` — width/height are mask resolution
- Owns one offscreen `<canvas>` (source of truth)
- `paintAt(x, y)` / `eraseAt(x, y)` / `paintStroke(points)` — coords in mask-space
- `setBrushSize(px)` / `setMode('paint' | 'erase')`
- `clear()`
- `loadFromDataUrl(dataUrl)` — async; decode-then-swap (no flicker)
- `toDataUrl()` returns `data:image/png;base64,...`
- Events: `'change'`, `'load'`

**`useFogEngine({ width, height })`** — single hook used in both game runtime and workshop.

**`fogWebSocketEvents.js`** mirrors `webSocketAudioEvents.js`:
- `handleRemoteFogUpdate(data, { engine })` — calls `engine.loadFromDataUrl(...)`
- `createFogSendFunctions(webSocket, isConnected, playerName)` returns `sendFogUpdate(fogConfig)`

**`FogCanvasLayer`** — thin React wrapper that mounts the engine canvas, sized to map image's `clientWidth/Height`, scaled by CSS so a low-res mask displays at full map size.

**`FogPaintControls`** — DM UI: paint/erase toggle, brush size slider, Clear, Update buttons.

### 6. Game runtime integration

- `MapDisplay.js`: insert `<FogCanvasLayer>` between map `<img>` and `<GridOverlay>` inside `contentRef` (inherits pan/zoom transform).
- `useMapWebSocket.js`: register `fog_config_update` handler that calls into the engine (engine reference passed via consumer). Fog state is **not** in `activeMap` React state — it lives in the engine canvas to honour the no-flicker rule.
- `MapControlsPanel.js`: add collapsible "Fog of War" section after Edit Grid; mount `<FogPaintControls>`; wire to `sendFogUpdate`.
- `GameContent.js`: instantiate `useFogEngine` once at this level; pass engine down to both `MapDisplay` and `MapControlsPanel`. Players: read-only `FogCanvasLayer`, no controls.

### 7. Workshop integration

- `WorkshopToolNav.js`: add `{ id: 'fog', label: 'Fog Mask', icon: '☁️', enabled: true }` to TOOLS array.
- `WorkshopManager.js`: add fog-mask route mapping.
- New page: `rollplay/app/(authenticated)/workshop/fog-mask/page.js` (mirror grid-mask page).
- New component: `rollplay/app/workshop/components/FogMaskTool.js` — fetch asset via `authFetch`, host `MapDisplay` + `FogCanvasLayer` + `FogPaintControls`, save via new `useUpdateFogConfig` mutation.
- New hook: `rollplay/app/workshop/hooks/useUpdateFogConfig.js` — TanStack mutation, mirror `useUpdateGridConfig.js`, handles 409.

### 8. Field drift discipline

Per `feedback_field_drift.md`: when piping `fog_config` through API → engine → WS → backend, **destructure-and-spread**, never reconstruct field-by-field. The `version` field is the canary that will rot first.

```js
const { fog_config } = activeMap.map_config
sendFogUpdate({ ...fog_config, mask: engine.toDataUrl() })
```

---

## Patch Notes

`rollplay/patch_notes/0.46.0.md` — match the style of recent entries.
- Fog of war overlay on maps with paint/erase brush
- DM controls in-game and in the map workshop
- Atomic mask updates over WebSocket — no flicker on slow connections
- Persisted per-map for prep work; carried into and out of live sessions

---

## Verification

**Backend**
1. `cd rollplay-shared-contracts && pytest`
2. `docker-compose -f docker-compose.dev.yml build api-site api-game`
3. `docker exec api-site-dev alembic current`
4. `docker exec postgres-dev psql -U postgres -d rollplay -c "\d map_assets"` — `fog_config` JSONB present
5. `curl -X PATCH /api/library/{id}/fog` with a tiny base64 PNG
6. `docker exec mongo-dev mongosh` — confirm `map_config.fog_config` updates after WS event

**Frontend (manual, two browsers as DM + player)**
1. Workshop: paint, Update, refresh → fog persists
2. Start session with that map: fog appears at session start (ETL cold→hot)
3. DM paints + clicks Update → player sees atomic update (DevTools breakpoint mid-update: old fog still visible)
4. DM erases hole → player sees map through hole (alpha works end-to-end)
5. Throttle player to "Slow 3G", repeat: no flicker
6. End session → reload workshop → final mask was written back (ETL hot→cold)

Skip `npm run build` per `feedback_dont_rebuild_reflexively.md`.

---

## Critical Files

**New:**
- `rollplay/app/fog_management/` (entire module)
- `rollplay/app/workshop/components/FogMaskTool.js`
- `rollplay/app/workshop/hooks/useUpdateFogConfig.js`
- `rollplay/app/(authenticated)/workshop/fog-mask/page.js`
- `rollplay/patch_notes/0.46.0.md`
- Alembic migration (autogenerated)

**Modified:**
- `rollplay-shared-contracts/shared_contracts/map.py` (+ `__init__.py`, + tests)
- `api-site/modules/library/model/map_asset_model.py`
- `api-site/modules/library/domain/map_asset_aggregate.py`
- `api-site/modules/library/application/commands.py`
- `api-site/modules/library/api/schemas.py`
- `api-site/modules/library/api/endpoints.py`
- `api-site/modules/session/application/commands.py` (ETL)
- `api-game/mapservice.py`
- `api-game/websocket_handlers/websocket_events.py`
- `api-game/websocket_handlers/app_websocket.py`
- `rollplay/app/map_management/components/MapDisplay.js`
- `rollplay/app/map_management/hooks/useMapWebSocket.js`
- `rollplay/app/game/components/MapControlsPanel.js`
- `rollplay/app/game/GameContent.js`
- `rollplay/app/workshop/components/WorkshopToolNav.js`
- `rollplay/app/workshop/components/WorkshopManager.js`
