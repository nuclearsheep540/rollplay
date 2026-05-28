# Fog Engine

Rollplay's fog-of-war system. DMs paint per-map alpha masks ("regions"); the renderer composites them into procedural wispy fog over the map, animated on the GPU via PixiJS.

---

## What it does

- DMs paint per-map fog masks in the workshop ahead of a session, or live during play.
- Up to 12 independent **regions** per map — each its own painted alpha + render params (opacity, edge softness). Toggle prepped regions on/off mid-session for staged reveals.
- One always-present **live region** per map for ad-hoc strokes during play.
- Strokes broadcast atomically over WebSocket to all players. Decode-then-swap on the receiver — no flicker on slow connections.
- Persists per-map in PostgreSQL; carried into and out of live sessions via ETL.

---

## Architecture at a glance

```
┌──────────────────────────────────────────────────────────────────┐
│  rollplay/app/fog_management/   (frontend module)                │
│                                                                  │
│   engine/FogEngine.js     — pure JS, one canvas per region       │
│   hooks/useFogRegions.js  — React adapter; engine pool + active  │
│   hooks/fogWebSocketEvents.js — handlers + send fns              │
│   components/FogRegionStack.js     — pointer events + cursor     │
│   components/FogPixiTextureLayer.js — PixiJS shader (singleton)  │
│   components/RegionListPanel.js, RegionParamsEditor.js,          │
│              FogPaintControls.js, FogRegionLabels.js — DM UI     │
│   utils/renderMaskCanvas.js — CPU blur+contrast for dilate       │
└──────────────────────────────────────────────────────────────────┘
            ▲                                          ▲
            │                                          │
   ┌────────┴─────────┐                    ┌───────────┴──────────┐
   │ Workshop         │                    │ Game runtime         │
   │ MapConfigTool    │                    │ GameContent          │
   │ → REST PATCH     │                    │ → WS broadcast       │
   └──────────────────┘                    └──────────────────────┘
            │                                          │
            ▼                                          ▼
   ┌──────────────────┐                    ┌──────────────────────┐
   │ api-site (PSQL)  │  ── ETL on start ──▶│ api-game (MongoDB)  │
   │ map_assets       │  ◀── ETL on end ────│ active_sessions     │
   │  .fog_config     │                    │  .map_config         │
   │  (JSONB)         │                    │     .fog_config      │
   └──────────────────┘                    └──────────────────────┘
```

Two-DB pattern follows the project rule: PostgreSQL is the cold store for all asset metadata, MongoDB is the hot store for live session state, and HTTP-based ETL migrates fog between them at session start/end.

---

## Data model

### Contract (`rollplay-shared-contracts/shared_contracts/map.py`)

```python
FOG_REGIONS_MAX = 12

class FogRegion(ContractModel):
    id: str                                  # uuid4 hex (or 'default' for legacy)
    name: str = "Region"                     # ≤ 64 chars
    enabled: bool = True
    role: Literal["prepped", "live"] = "prepped"
    mask: Optional[str] = None               # data:image/png;base64,...
    mask_width: Optional[int] = None
    mask_height: Optional[int] = None
    hide_feather_px: int = 20                # 0..200 — currently unused (see note)
    texture_dilate_px: int = 30              # 0..200 — CPU pre-blur applied to mask
    opacity: float = 1.0                     # 0..1 — fed to shader as uMaskOpacities[i]

class FogConfig(ContractModel):
    regions: List[FogRegion] = []            # max_length = FOG_REGIONS_MAX
    version: int = 2
```

`FogConfig` is `Optional[FogConfig]` on `MapConfig`. `null` semantics depend on the surface — see "Preserve vs clear" below.

**Note on `hide_feather_px`:** legacy field from the pre-PixiJS hide layer (a separate DOM div with CSS-mask). The hide layer was folded into the shader, so this value is no longer consumed. The field stays in the contract for compatibility; the shader's per-pixel falloff is driven by `texture_dilate_px` alone.

### Why bitmap, not geometry

The mask is per-pixel alpha, not vector polygons. Complex shapes (holes, disconnected blobs, soft edges) emerge naturally from alpha values inside a rectangular bound. `mask_width × mask_height` are just bitmap dimensions, not a shape description. Erase = `globalCompositeOperation: 'destination-out'` cuts real transparent holes.

### Why inline base64 in WS payload

A typical alpha-only PNG at ≤1024² downscales/compresses to ~10–80KB. That fits in a single WS frame and eliminates the S3 round-trip flicker risk of "fetch between updates."

---

## FogEngine (per-region canvas)

`rollplay/app/fog_management/engine/FogEngine.js`. Pure JS, no React, no WebSocket — shared verbatim between the workshop and the game runtime.

**Owns:** one off-DOM `<canvas>` (the source of truth for one region's mask).

**Paint model:**

- A pre-built **brush stamp** canvas (radial gradient, `BRUSH_HARDNESS = 0.0` = soft falloff), cached per brush size.
- `paintStroke([{x, y}, ...])` walks the polyline, stamping every `STAMP_SPACING_FRACTION × diameter` (0.25 of the brush diameter) so fast drags stay continuous and the soft rim is preserved.
- Mode flips composite op: `source-over` for paint, `destination-out` for erase. Partial alpha is preserved by both.

**Stroke lifecycle (for undo/redo):**

- `beginStroke(kind)` snapshots `toDataUrl()` before any change.
- `endStroke()` snapshots again, emits `strokeend` with `{ before, after, kind }`, returns the pair (or null on no-op).
- `fillAll()` and `clear()` auto-wrap in begin/end so subscribers don't special-case bulk ops.

**No-flicker contract:** `loadFromDataUrl(dataUrl)` decodes into an `Image` first, then paints to the canvas only after `onload`. Old fog stays on screen until the new mask is fully decoded. On decode failure, the old canvas is preserved.

**Region identity round-trip:** `loadFromRegion({ id, mask, ... })` captures the region's id; `serialize()` round-trips it. Without this, every save would create a new row.

**Events:** `change`, `load`, `strokeend`, `brushchange`, `modechange`, `error`.

---

## useFogRegions (orchestration)

`rollplay/app/fog_management/hooks/useFogRegions.js`. The React adapter that owns the engine pool.

**State:**

- `regions` — React state. The contract-shaped list.
- `enginesRef` — `Map<region_id, FogEngine>` outside React state. Engines are reused across renders; the canvas is never remounted (no-flicker contract).
- `activeId` — id of the region paint/clear/fillAll route to.
- `brushSize`, `mode` — **tool-level**, not per-region. Pushed to every engine so switching regions doesn't surface stale brush state.
- `maskDimsRef` — current map-fitted dimensions; new engines get sized from this so regions added after `fitToMap` aren't stranded at 1024².

**Key callbacks:**

- `loadFromConfig(fogConfig)` — replaces the whole regions list and hydrates each engine's canvas via `loadFromRegion`. Used by both initial load and remote WS updates.
- `serialize()` — builds the v2 regions list by merging React metadata with each engine's live canvas. The active stroke round-trips even before save.
- `addRegion(opts)` / `deleteRegion(id)` — synchronous decisions made against `regionsRef.current` (not via `setRegions` updater) so rapid-fire clicks in the same tick can't double-add past the 12 cap. Live regions reject delete.
- `setRegionEnabled(id, enabled)`, `updateRegion(id, partial)` — partial updates.
- `getEngine(id)` — resolver passed to `FogRegionStack` so the renderer stays decoupled from the engine map.
- `fitToMap(naturalW, naturalH, maxEdge=1024)` — resizes **every** engine, not just the active one, so the union compositor doesn't drift between mismatched-size regions.

---

## Render pipeline

### Layer composition

```
<FogRegionStack>                  ← pointer events, cursor, mount gating
  └ <FogPixiTextureLayer />       ← singleton; PixiJS shader covers full map
```

Per-region opacity flows into a shader uniform array. Per-region `texture_dilate_px` is applied CPU-side (a blur+contrast scratch canvas) before the mask is uploaded to GPU.

### FogRegionStack

`rollplay/app/fog_management/components/FogRegionStack.js`.

- Tracks the map image's rendered size via `ResizeObserver`. Wrapper div sizes itself to match.
- **Mount gating** — the single source of truth: `ready = imgDims.w > 0 && imgDims.h > 0`. The texture layer mounts only when `ready` **and** at least one enabled engine exists. This eliminates the pre-PixiJS bug where the layer mounted with a null ref and the `useLayoutEffect` mask-priming silently bailed (leaving the map covered in unmasked fog on fresh asset load).
- Routes pointer events (`onPointerDown/Move/Up`) to the active engine via `screenToMask`. Walks the stroke through `engine.paintStroke(...)` segment-by-segment.
- Owns the brush cursor lifecycle. The cursor `<div>` lives **outside** the fog wrapper but inside the pan/zoom container (`contentRef`), so it inherits the same transform without re-entering the fog layer's compositing tree. This was step 2 of the pre-PixiJS perf work — cursor compositing is no longer tied to fog-layer invalidations.
- Drops focus from focused inputs on paint click, so subsequent keyboard shortcuts (e.g. spacebar pan) aren't gated by the input-focus guard.
- Exposes `paintingRef` so callers (e.g. the spacebar pan override) can skip behaviour mid-stroke.

### FogPixiTextureLayer (the shader)

`rollplay/app/fog_management/components/FogPixiTextureLayer.js`.

Replaces the previous CSS-tiled animated-GIF + SVG-filter + offscreen-union-canvas approach. Costs went from 13–17fps with map visible to a sustained 60fps.

**Why PixiJS, not Three.js or CSS:**
- 2D-native — matches the app's mental model.
- ~100KB gz vs Three's ~150KB.
- `PIXI.Texture.from(canvas)` + `source.update()` maps cleanly onto the engine-canvas-as-GPU-texture pattern.
- `PIXI.ParticleContainer` available for future weather effects (rain/snow); shaders compose for future dynamic lighting.

**Init (once per mount):**

1. Dynamic `import('pixi.js')`. Async to keep it out of the cold-load bundle when no map is mounted.
2. `app.init({ canvas, width, height, autoStart: false, backgroundAlpha: 0, resolution: devicePixelRatio, preference: 'webgl' })`.
3. A 1×1 transparent **pad canvas** wrapped in a `PIXI.Texture` — bound to every unused sampler slot so all `uMask0..uMask11` bindings stay valid.
4. A full-canvas quad `PIXI.Geometry` (positions match `imgDims`, UVs 0..1).
5. `PIXI.GlProgram.from({ vertex, fragment })` + `PIXI.Shader.from({ gl, resources })` declaring `fogUniforms` (time, noise/drift/warp/gap-close/alpha-floor scalars, tint colours, hide colour/opacity, mask count, opacity array) and the 12 sampler slots.
6. `app.ticker.add(callback)` updates `uTime`; ticker is started. Ticker is paused on `visibilitychange` when the tab is hidden.

**Vertex shader:** projects the quad through Pixi's MVP, passes UV through.

**Fragment shader (WebGL2/GLSL 3.00 ES):**

```glsl
vec2 warp = vec2(
    snoise(uv * 4.0 + vec2(uTime * uDriftSpeed, 0.0)),
    snoise(uv * 4.0 + vec2(0.0, uTime * uDriftSpeed))
) * uWarpAmount;

vec2 sampleUV = uv + warp;

float rawNoise =
      snoise(sampleUV * uNoiseScale)        * 0.6
    + snoise(sampleUV * uNoiseScale * 2.0)  * 0.3
    + snoise(sampleUV * uNoiseScale * 4.0)  * 0.1;

float colorMix = clamp(rawNoise * 0.5 + 0.5, 0.0, 1.0);  // unbiased for tint
float n        = clamp(rawNoise * 0.5 + 0.8, 0.0, 1.0);  // density-biased
n = pow(n, uGapClose);                                   // closes wisp gaps

// Union mask across enabled regions — max alpha per pixel, weighted by per-region opacity.
float unionMask = 0.0;
for (int i = 0; i < MAX_REGIONS; i++) {
    if (i >= uMaskCount) break;
    unionMask = max(unionMask, sampleMaskAlpha(i, uv));   // unrolled sampler dispatch
}

float alpha = max(n, uAlphaFloor) * unionMask;
vec3  tint  = mix(uFogTintThin, uFogTintDense, colorMix);

vec3  wispRGB = tint * alpha;
float wispA   = alpha;

// Hide layer (flat dark underlay) — folded into the shader; no separate DOM layer.
float hideA = uHideOpacity * unionMask;
vec3  hideRGB = uHideColor * hideA;

// Porter-Duff "over" on premultiplied data.
finalColor = vec4(wispRGB + hideRGB * (1.0 - wispA),
                  wispA   + hideA   * (1.0 - wispA));
```

Key techniques:

- **Domain-warped multi-octave simplex noise** for wispy organic edges. Replaces the old `feTurbulence + feDisplacementMap` SVG filter chain.
- **Animated by `uTime` only** — the GPU re-evaluates the noise each frame; no main-thread paint cost.
- **Sampler indexing is unrolled** — `sampleMaskAlpha(idx, uv)` is an `if`/`if`/... ladder because WebGL2 sampler indexing requires a constant expression. 12 slots is the cap.
- **Gap-closing curve** (`uGapClose < 1`) lifts thin-wisp pixels toward dense ones so the fog reads as continuous coverage rather than airy gaps. 1.0 disables.
- **Alpha floor** (`uAlphaFloor`) clamps minimum alpha in painted areas. At 1.0 the fog is fully opaque and "wispy character" is carried entirely by tint variation; at 0.0 alpha tracks noise (the original look, with map peeking through deep dips). Mask-edge falloff at the painted boundary is unaffected.
- **Hide layer in shader**, not a separate DOM div with CSS-mask. Eliminates the per-event `toDataURL` + `mask-image` upload cost; the mask stays on the GPU.

### Mask texture lifecycle

The pipe between an engine's `<canvas>` and the shader's sampler:

```
engine canvas (binary alpha from brush strokes)
        │
        ▼  renderMaskCanvas(srcCanvas, dstRef, blurPx=texture_dilate_px, contrast=2)
        │  CPU-side `ctx.filter = 'blur(...) contrast(2)'`
        ▼
scratch canvas (per region, owned by region state map)
        │
        ▼  PIXI.Texture.from(scratch); texture.source.update() on engine 'change'/'load'
        ▼
shader.resources[`uMask${i}`] = texture.source   (rebound when regions add/remove)
```

`texture_dilate_px` extends the painted alpha outward; `contrast=2` steepens the inside back up to peak. The scratch canvas is reused via a ref so we don't allocate per frame.

**Sync effect (rebind on regions change):**

1. Iterate `enabledRegions`. For new regions, build a scratch canvas + Pixi texture + subscribe to `change`/`load`.
2. For existing regions whose `texture_dilate_px` changed, re-blur the scratch and `source.update()`.
3. For removed regions, **defer texture destruction** until after all live samplers are rebound. Destroying a texture's source while it's still bound invalidates Pixi v8's `shader.resources.fogUniforms` internals; the deferred-destroy pattern dodges that. After rebinding, `tex.destroy(true)` reclaims GPU memory.
4. Pad remaining sampler slots with the global pad texture; zero out unused opacity slots.
5. Set `uMaskCount = enabledRegions.length`.

### Pan/zoom

The Pixi `<canvas>` sits inside the existing pan/zoom `contentRef`. CSS transform on `contentRef` scales the canvas pixels — works transparently. Resolution is fixed at `devicePixelRatio` at mount time; high-zoom blur is acceptable for current use.

### Render-loop gating

- The ticker runs every frame while mounted (the animation **is** the time uniform — there's no "nothing changed" case where we can skip).
- Ticker is paused on `document.hidden` via `visibilitychange`.
- `FogRegionStack` only mounts the texture layer when at least one enabled region has an engine, so an empty-fog map costs nothing.

---

## WebSocket flow

`rollplay/app/fog_management/hooks/fogWebSocketEvents.js`.

### Outbound (DM)

```js
sendFogUpdate(filename, fogConfig)
  → ws.send({ event_type: 'fog_config_update',
              data: { filename, fog_config: { version: 2, regions: [...] } | null } })
```

Atomic full-list replace. Sent on stroke-end / explicit "Update fog" / `clear()` / `fillAll()`.

### Inbound (everyone)

```js
handleRemoteFogUpdate(data, { loadFromConfig })
  → loadFromConfig(data.fog_config)
  → for each region: engine.loadFromRegion(region)   // decode-then-swap
```

The engine's no-flicker contract holds because each region's `loadFromDataUrl` decodes the PNG into an `Image` before painting to the canvas. Old fog stays visible until the new mask decodes.

`registerFogHandlers({ registerHandler, loadFromConfig })` wires the handler into the router and returns a single cleanup.

---

## Backend

### api-site (PostgreSQL — cold storage)

**Model:** `api-site/modules/library/model/map_asset_model.py` — `fog_config = Column(JSONB, nullable=True)`. Single JSONB column; v2 shape is `{ version: 2, regions: [...] }`.

**Aggregate:** `api-site/modules/library/domain/map_asset_aggregate.py`.

Domain methods (all validated against the `FogRegion` contract on write — unknown keys raise, missing required fields raise):

- `update_fog_config(regions=None | [...])` — atomic full replace. `regions=None | []` clears.
- `has_fog_config()` — true only if at least one region has a populated mask.
- `get_fog_config()` / `get_fog_regions()` — read accessors.
- `add_fog_region(name, role='prepped')` — append with defaults; returns new region dict. Raises on 12-cap hit.
- `update_fog_region(region_id, **fields)` — partial update of one region.
- `delete_fog_region(region_id)` — raises on `role='live'`.
- `toggle_fog_region(region_id, enabled)` — convenience for runtime.
- `build_fog_config_for_game()` — returns `FogConfig` for ETL; `None` if no fog ever set.
- `update_fog_config_from_game(FogConfig | None)` — inverse, used on session end.
- `to_contract(file_path)` / `update_from_contract(contract)` — single-source-of-truth aggregate↔contract translation. Adding a new `MapConfig` field updates these methods and **every** ETL-like caller benefits automatically. Catches field drift at the boundary.

**Endpoints:** `api-site/modules/library/api/endpoints.py`

- `PATCH /api/library/{asset_id}/fog` — full-list replace. 409 if asset is in active session.
- `POST /api/library/{asset_id}/fog/regions` — add region.
- `PATCH /api/library/{asset_id}/fog/regions/{region_id}` — update one region.
- `DELETE /api/library/{asset_id}/fog/regions/{region_id}` — 409 if `live`.

All endpoints return the full `MediaAssetResponse` so TanStack Query cache invalidations get the latest state in one hop.

### api-game (MongoDB — hot storage)

`api-game/mapservice.py`:

- `update_fog_config(room_id, filename, fog_config)` — `$set` of `map_config.fog_config` on `active_sessions`. Atomic full replace.

`api-game/websocket_handlers/websocket_events.py`:

- `fog_config_update` — receives `{ filename, fog_config }`, persists, broadcasts back to room.

### ETL (session lifecycle)

`api-site/modules/session/application/commands.py`.

**Cold → hot (session start):** `_restore_map_config` calls `map_asset.to_contract(file_path=fresh_url)` → the contract carries `fog_config` along with grid/file metadata → sent as part of the room init payload to api-game → MongoDB document created with the full fog state.

**Hot → cold (session end):** `EndSession` fetches the final `MapConfig` from api-game → calls `map_asset.update_from_contract(contract)` → fog (including any in-session edits via the live region or per-region tweaks) persists back to PostgreSQL.

### Preserve vs clear (the `null` semantics rule)

Different surfaces interpret `fog_config: null` differently. The rule is encoded in `api-game/websocket_handlers/websocket_events.py` via `_merge_preserved_map_fields`:

| Surface | Direction | `null` for fog means | Rationale |
|---|---|---|---|
| `_restore_map_config` (cold→hot ETL) | init | "no fog yet" | Cold IS the source of truth at birth. |
| `EndSession` (hot→cold ETL) | persist | "no fog at session end" | Final state — user may have cleared. |
| `map_load` WS event | runtime mutation | **preserve existing** | Event is about switching maps; fog is incidental cargo. |
| `fog_config_update` WS event | runtime mutation | **clear** | Explicit fog mutation — null is the clear signal. |
| `PATCH /api/library/{id}/fog` | persist | **clear** | Explicit user action via the dedicated endpoint. |

Any **future** event that carries `MapConfig` but isn't fog-owned must call `_merge_preserved_map_fields` — the helper exists precisely to make the "cargo, not subject" rule one line of code and hard to skip.

---

## Workshop and runtime integration

### Workshop (`rollplay/app/workshop/components/MapConfigTool.js`)

- Single asset, hosted in the workshop frame with map + fog tools.
- `useFogRegions({ initialConfig: asset.map_config?.fog_config })` instantiates the hook.
- Region list UI (`RegionListPanel`) — add/rename/delete/reorder/toggle, 12-cap.
- Per-region param sliders (`RegionParamsEditor`) — opacity, dilate. Live preview.
- Tool palette routes paint/erase to the active region's engine via `setMode` + `FogRegionStack` pointer events.
- Auto-save on `strokeend` posts the full v2 regions list via `PATCH /api/library/{id}/fog`.
- Undo history is per-region (each region has its own `useActionHistory` instance keyed by id).

### Game runtime (`rollplay/app/game/GameContent.js`)

- `useFogRegions` instantiated once at this level; passed to `MapDisplay` (rendering) and `MapControlsPanel` (DM controls).
- DMs see the region toggle list + the live region's paint controls. Players see only the composited fog.
- DM strokes broadcast `fog_config_update` over the game WebSocket; api-game persists to MongoDB and rebroadcasts; all clients (including the DM) call `loadFromConfig`. The decode-then-swap path means the DM's own canvas never flickers.
- Hydration `useEffect` runs only on `[asset_id]` change — **not** on `fog.engine` identity. The earlier bug where adding a region triggered re-hydration and wiped the just-added region was tracked to that dep.

### MapDisplay (`rollplay/app/map_management/components/MapDisplay.js`)

- Mounts the map image, the grid overlay, `<FogRegionStack>`, and the brush cursor `<div>` (as a sibling outside the fog wrapper so its compositing isn't tied to fog repaints).
- Threaded through both consumers; same code path for workshop and runtime.

---

## Performance notes

- **Pre-PixiJS baseline:** 13–17fps with map visible, regardless of map size or audio state. Animated GIF tile grid + SVG filter chain re-running every frame was the dominant cost.
- **Post-PixiJS:** sustained 60fps. Cost is dominated by a single fragment shader execution per pixel per frame, all on the GPU.
- **SMIL animation** (the old `<animate>` on `feTurbulence baseFrequency`) was the worst single offender pre-shared-texture. It forced the whole filter chain to recompute every frame even when idle. Deleted as part of the shared-texture refactor; never reintroduced.
- **Runtime-only audio meter rAF cascade** was a confounding factor — workshop ran at 60fps with the same fog because no audio meters were mounted. Mixer-strip meters now bail when the drawer is closed. Documented in `.claude-plans/runtime-perf-investigation.md`.
- **Render-tracker overlay** (`app/shared/utils/renderTracker.js` + `app/shared/components/PerfOverlay.js`) is the standing instrumentation; toggle via the gauge icon in the DM top nav (dev only).

---

## Known trade-offs

- **Visual:** the shader's procedural fog doesn't pixel-match the old hand-crafted GIF. It's tuned to look organic and wispy (multi-octave noise + domain warp + tint variation) but the exact aesthetic differs. Tunable via uniforms without rebuilding the shader.
- **WebGL required.** Extremely high availability on modern browsers/devices, but not 100%. There is no fallback path — the layer just won't mount. Acceptable for the target audience.
- **Bundle:** Pixi adds ~100KB gz. Code-split via dynamic `import('pixi.js')` so it doesn't hit cold load when no map is mounted.
- **Memory:** ~4MB GPU per 1024² region × up to 12 = ~48MB max. Within budget for any modern device.
- **Mask-edge softness is CPU-bound** (`texture_dilate_px` is applied in `renderMaskCanvas` before upload). Moving it into the shader is feasible but the CPU cost is currently negligible compared to the historical GIF baseline.
- **`hide_feather_px` is unused** post-PixiJS (the hide layer was folded into the shader). The field stays in the contract for forward/backward compatibility; not worth a migration.

---

## Future extensibility

The PixiJS context lays the foundation for:

- **Weather overlays** — `PIXI.ParticleContainer` for rain/snow. Thousands of sprites at 60fps.
- **2D dynamic lighting** — additional render pass with shadow-casting from obstacle polygons; multiplicatively blend with the map.
- **Atmospheric tints** — a final color-matrix filter on the Pixi stage.
- **Animated transitions** — tween fog reveal/conceal between region toggles.

These are additive on top of the fog work, not replacements.

---

## Critical files

**Frontend (`rollplay/app/`):**
- `fog_management/engine/FogEngine.js` — per-region canvas + paint ops
- `fog_management/hooks/useFogRegions.js` — engine pool + active region
- `fog_management/hooks/fogWebSocketEvents.js` — WS handlers + senders
- `fog_management/components/FogRegionStack.js` — pointer events + mount gating
- `fog_management/components/FogPixiTextureLayer.js` — PixiJS shader
- `fog_management/utils/renderMaskCanvas.js` — CPU blur for dilate
- `fog_management/components/{RegionListPanel,RegionParamsEditor,FogPaintControls,FogRegionLabels}.js` — DM UI
- `map_management/components/MapDisplay.js` — host
- `workshop/components/MapConfigTool.js` — workshop integration
- `game/GameContent.js` — runtime integration

**Backend:**
- `rollplay-shared-contracts/shared_contracts/map.py` — `FogRegion`, `FogConfig`, `MapConfig`
- `api-site/modules/library/domain/map_asset_aggregate.py` — domain methods + `to_contract`/`update_from_contract`
- `api-site/modules/library/application/commands.py` — `UpdateFogConfig` and per-region commands
- `api-site/modules/library/api/endpoints.py` — REST endpoints
- `api-site/modules/session/application/commands.py` — ETL (cold↔hot)
- `api-game/mapservice.py` — MongoDB updates
- `api-game/websocket_handlers/websocket_events.py` — `fog_config_update` handler + `_merge_preserved_map_fields`
