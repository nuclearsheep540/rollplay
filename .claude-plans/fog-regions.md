# Fog of War — Regions

## Context

Today's fog system is a single per-map alpha mask + a single set of render parameters (feather, dilate, color, etc.) baked in as file-level constants in `FogCanvasLayer.js`. That model conflates two very different DM workflows:

1. **Strategic prep** — "the cave entrance, the throne room, the secret passage are each their own area I'd want to reveal at different points in the session." Currently impossible without re-painting the whole mask each time.
2. **Improvised reveals** — "the player just kicked open this door, let me erase a hole." This works fine today.

This plan introduces **regions**: independent fog entities, each with its own painted mask + its own render config. A map carries up to **12 regions**. The DM paints each region in the workshop ahead of time; at runtime, regions are toggled enabled/disabled with no painting required for prepared content. A designated "Live" region remains for ad-hoc strokes during play.

This also resolves the per-stroke feather question raised mid-implementation: since each region carries its own feather/dilate/etc., the per-stroke complexity dissolves. Feather is a property of the *region*, not of individual strokes within it. A region behaves exactly like the current single-mask system; we go from N=1 to N=many of the same primitive.

**Design decisions reached during discussion:**

1. **12-region soft cap.** Render cost scales linearly with active regions (each adds an SVG filter, blurred mask canvas, GIF tile grid). 12 is roomy for typical use and bounded for performance.
2. **`FOG_*` constants in `FogCanvasLayer.js` become region defaults**, not global tuning knobs. The file still exports them as "new region" defaults; the per-region values override at render time.
3. **Atomic region updates** per CLAUDE.md's atomic-state-update rule. Toggling region 5 broadcasts the full `regions[]` array with one entry's `enabled` flipped, not a partial diff. Same pattern as `grid_config`.
4. **Migration: existing single-mask fog becomes a "Default" region.** Any map with a `fog_config.mask` populated today is treated on first read as `regions: [{ name: "Default", mask: <existing>, enabled: true, ...defaults }]` plus a `Live` scratch region.
5. **DM-only feature for the MVP.** Players never see the region list, just the composed fog. Region names are private DM context.
6. **One `FogEngine` instance per region.** No new orchestrator class — just a list of engines plus a "active region id" pointer that the workshop's painting tool routes strokes to.

---

## Architecture Overview

```
                    ┌──────────────────────────────────────────────┐
                    │           Map Asset (PostgreSQL)             │
                    │   fog_config: { regions: [Region, ...] }     │
                    └──────────────────────────────────────────────┘
                                          │
                          ┌───────────────┴───────────────┐
                          │                               │
                          ▼                               ▼
              ┌────────────────────┐         ┌─────────────────────────┐
              │ Workshop           │         │ Game runtime            │
              │ (asset's regions)  │         │ (active session, hot)   │
              │                    │         │                         │
              │ • Region list UI   │         │ • Region toggle list    │
              │ • Add / rename /   │         │ • Live region for       │
              │   delete / reorder │         │   ad-hoc paint          │
              │ • Per-region       │         │ • Per-region params     │
              │   feather/color    │         │   editable too (DM)     │
              │ • Active region    │         │                         │
              │   = paint target   │         │                         │
              └────────────────────┘         └─────────────────────────┘
                          │                               │
                          │                               ▼
                          │                       ┌──────────────────┐
                          │                       │  api-game (Mongo)│
                          │                       │  fog_config full │
                          │                       │  region list     │
                          │                       └──────────────────┘
                          ▼
                  ┌────────────────────┐
                  │ N × FogCanvasLayer │
                  │ stacked z-index    │
                  └────────────────────┘
```

**Frontend rendering:** `FogCanvasLayer` stays as-is — one rendered region. A new `FogRegionStack` component maps over the active regions and mounts one `FogCanvasLayer` per enabled region with the region's own params as props. Compositing emerges naturally from CSS layering (overlapping enabled regions = denser fog, since two hide layers stack).

**State ownership:** the workshop owns a list of `FogEngine` instances (one per region). The painting tool tracks an `activeRegionId` and routes pointer events to that region's engine. Strokes auto-save (existing pattern) update only the active region.

---

## Schema

### 1. `rollplay-shared-contracts` — `FogRegion` + updated `FogConfig`

**File:** `rollplay-shared-contracts/shared_contracts/map.py`

```python
class FogRegion(ContractModel):
    """One independent fog area on a map. Owns its own painted mask
    plus the render parameters that today are file-level constants in
    FogCanvasLayer.js. Multiple regions composite naturally via CSS
    layering — overlapping enabled regions = denser fog.
    """

    id: str = Field(..., min_length=1)            # uuid4 hex
    name: str = Field(default="Region", min_length=1, max_length=64)
    enabled: bool = Field(default=True)
    mask: Optional[str] = Field(default=None, min_length=1)  # data URL
    mask_width: Optional[int] = Field(default=None, ge=1)
    mask_height: Optional[int] = Field(default=None, ge=1)

    # Render params — were FOG_* constants in FogCanvasLayer.js.
    # FOG_HIDE_COLOR stays a file-level constant (consistent fog tone
    # across the map; not user-tunable). Only feather, dilate, and the
    # painter's knock-back opacity are region-editable.
    hide_feather_px: int = Field(default=20, ge=0, le=200)
    texture_dilate_px: int = Field(default=30, ge=0, le=200)
    paint_mode_opacity: float = Field(default=0.7, ge=0.0, le=1.0)

    # Identification — not all regions are equal:
    # 'prepped' regions are pre-painted strategic areas the DM toggles
    # at runtime. 'live' is the special scratch region for ad-hoc paint
    # during play. Exactly one 'live' region per map.
    role: str = Field(default="prepped")  # 'prepped' | 'live'


class FogConfig(ContractModel):
    """Fog of war state for a map — a list of regions.

    For maps painted under the v1 single-mask system, server-side
    migration on first read produces a single 'Default' region from
    the legacy fields. Frontend never sees the legacy shape.
    """

    regions: List[FogRegion] = Field(default_factory=list, max_length=12)
    version: int = 2
```

**Tests:** `tests/test_contracts.py` — round-trip a FogConfig with 12 regions; verify max_length=12 enforces; verify v1→v2 migration path round-trips correctly.

### 2. `api-site` — MapAsset persistence

- **Model** (`map_asset_model.py`): `fog_config` JSONB column already exists. No DDL change. Schema lives inside the JSONB.
- **Aggregate** (`map_asset_aggregate.py`):
  - `update_fog_config(...)` accepts the new shape and validates `len(regions) <= 12`
  - `get_fog_config()` migrates legacy single-mask fog to a one-region list inline (returns the new shape, never the old)
  - `add_fog_region(name, role='prepped')` — creates and appends a region with defaults; returns the new region id
  - `update_fog_region(region_id, ...)` — partial update of one region
  - `delete_fog_region(region_id)` — guard against deleting a `live` region
  - `toggle_fog_region(region_id, enabled)` — convenience for runtime
- **Migration**: no Alembic migration needed — it's a JSONB shape evolution. The aggregate handles it on read. New writes always go through the v2 shape.
- **Schemas** (`api/schemas.py`): `FogRegionRequest`, `UpdateFogConfigRequest` (full list replace), region-level request DTOs.
- **Endpoints** (`api/endpoints.py`):
  - `PATCH /api/library/{asset_id}/fog` — full-list replace (existing endpoint, new shape)
  - `POST /api/library/{asset_id}/fog/regions` — add region
  - `PATCH /api/library/{asset_id}/fog/regions/{region_id}` — update one region
  - `DELETE /api/library/{asset_id}/fog/regions/{region_id}` — delete one region (409 if it's the live region)
  - All fog endpoints return the full `MediaAssetResponse` so the frontend can react-query-cache the latest state.

### 3. `api-game` — MongoDB & WebSocket

- `mapservice.py`:
  - `update_fog_config(room_id, fog_config)` already exists; the only thing that changes is the shape it stores. The atomic-update pattern is preserved — the entire `regions[]` list is replaced atomically.
  - `update_fog_region(room_id, region_id, region)` — `$set map_config.fog_config.regions.$[r]` with `arrayFilters=[{"r.id": region_id}]`. Atomic at the region granularity for runtime toggles where a full broadcast is wasteful.
  - `toggle_fog_region(room_id, region_id, enabled)` — same as above, narrower update scope.
- `websocket_handlers/websocket_events.py`:
  - `fog_config_update` (existing) — full-list replace, same as `grid_config_update`. Used when DM lands a paint stroke or commits a major edit.
  - `fog_region_toggle` (new) — `{ region_id, enabled }`. Cheap broadcast for the toggle UI.
  - `fog_region_paint` (new) — `{ region_id, mask, mask_width, mask_height }`. Per-region paint commit; only sends the affected region's mask, not all 12.
- `websocket_handlers/app_websocket.py`: dispatch cases for the two new events.

### 4. ETL — Session start / end

- `api-site/modules/session/application/commands.py` `_restore_map_config`: passes through `fog_config.regions` unchanged (the contract carries the full list).
- `StopSession`/`EndSession`: persist the final regions list — including any in-session edits the DM made via the live region or per-region tweaks.

---

## Frontend Changes

### 5. `rollplay/app/fog_management/` — region-aware engine

**Engine layer (no API change for one region; new orchestration above):**

- `FogEngine` stays exactly as-is — one canvas, paint/erase, undo events. Each region instantiates its own.
- New `useFogRegions({ regions, activeRegionId })` hook — manages a `Map<region_id, FogEngine>` and the active id. Returns:
  - `engines` — Map of region_id → engine
  - `activeEngine` — the engine matching `activeRegionId`
  - `setActiveRegion(id)`
  - `addRegion(opts)` / `removeRegion(id)` / `updateRegion(id, partial)`
  - `serialize()` — emits the full `FogConfig` v2 list (mask + params per region)

**Render layer:**

- `FogCanvasLayer` accepts new props: `hideFeatherPx`, `textureDilatePx`, `paintModeOpacity` — those file-level constants become per-instance overrides. `FOG_HIDE_COLOR` stays a constant (intentionally not user-tunable; the colour was hand-tuned and uniformity across regions is a feature). Default values stay where they are; instance props win.
- New `FogRegionStack` component:
  - Maps over enabled regions, renders one `FogCanvasLayer` per region (each gets its own `engine`, params, paint mode flags).
  - Renders regions as DOM siblings at the same z-index — paint order = array order. With hide+texture layers stacking inside each region, overlapping regions naturally compose to denser fog regardless of order, so explicit z-index per region is unnecessary.
  - `paintMode` is true on the active region only. Other regions render as static fog.
- `MapDisplay` swaps its single `<FogCanvasLayer>` for `<FogRegionStack>`.

**WebSocket handlers:**

- `fogWebSocketEvents.js`:
  - `handleRemoteFogConfigUpdate(data, { stack })` — full-list replace, calls `stack.replaceAll(regions)`
  - `handleRemoteFogRegionToggle(data, { stack })` — `stack.toggleRegion(id, enabled)`
  - `handleRemoteFogRegionPaint(data, { stack })` — `stack.loadRegionMask(id, mask, w, h)`
  - `createFogSendFunctions` returns `sendFogConfigUpdate(regions)`, `sendFogRegionToggle(id, enabled)`, `sendFogRegionPaint(id, region)` — granular event helpers.

### 6. Workshop integration

- `MapConfigTool.js`:
  - New right-panel section above `FogPaintControls`: **Region list** (drag-to-reorder, name input inline, enabled checkbox, delete button, "active" highlight, "+ Add region" button at bottom, capped at 12).
  - Tool selection ("Paint" / "Erase") routes strokes to the active region's engine.
  - Per-region params editor (collapsed by default): hide_feather_px slider, texture_dilate_px slider, paint_mode_opacity slider. Live preview — params apply immediately to the rendered region. (No colour picker — hide colour stays a global constant.)
  - Auto-save (the strokeend pattern) sends a per-region `PATCH /fog/regions/{id}` rather than the full list, since only the active region's mask changed. Param edits send PATCH for that region only.
  - Undo history: each region has its own `useActionHistory` instance, keyed by region id. Switching regions shows that region's stroke history.

### 7. Game runtime integration

- `GameContent.js`:
  - Replace `useFogEngine` with `useFogRegions`. DM gets the region list; players just consume the rendered output.
  - Region toggles live in `MapControlsPanel.js` (the existing map drawer that already houses grid + fog controls). New collapsible section above the existing fog paint controls: list of regions with names + enabled checkboxes, defaults to expanded. No paint controls per region from this list — just visibility toggles.
  - "Live" region keeps the existing paint-controls UX in the same drawer. Strokes broadcast `fog_region_paint` for the live region only — much smaller payload than rebroadcasting all 12 masks every stroke.
  - Per-region param editing also available DM-side at runtime, broadcast via region-level PATCH.
- Players: `FogRegionStack` renders the composite. Region names and the toggle list are DM-only state.

---

## Patch Notes

`rollplay/patch_notes/0.47.0.md` — match style of recent entries.
- Fog regions: paint multiple independent fog areas per map and toggle them on/off at runtime
- Per-region softness, color, and feather settings — each region is its own visual config
- Region list with name, reorder, and 12-region cap
- "Live" scratch region preserved for ad-hoc paint during play
- Backwards compatible: existing painted maps upgrade to a single "Default" region automatically

---

## Verification

**Backend**
1. `cd rollplay-shared-contracts && pytest` — round-trip 12-region config; v1→v2 migration; 13 regions rejected.
2. `docker-compose -f docker-compose.dev.yml build api-site api-game`
3. Read an existing single-mask fog map via `GET /api/library/{id}` — response shows `fog_config.regions[0]` named "Default" with the legacy mask data.
4. `POST /api/library/{id}/fog/regions` — adds region, returns 200 with new region in list.
5. `POST` 12 more regions — 13th attempt returns 409 (cap hit).
6. `DELETE` the live region — returns 409.

**Frontend (manual, two browsers as DM + player)**
1. Workshop: paint region A in one corner of the map, name it "North", auto-saves.
2. Click "+ Add region", paint region B, name it "South". Confirm strokes go into B not A.
3. Toggle A's enabled checkbox off in the workshop preview — region A vanishes, B remains.
4. Tweak A's `hide_feather_px` slider — region A's softness updates live; region B unaffected.
5. Refresh page → both regions persist, named correctly, params preserved.
6. Start a session with this map → DM sees toggle list; player sees both regions composited.
7. DM toggles A off → player sees only B's fog (atomic update, no flicker).
8. DM uses Live region to erase a hole during play → player sees the hole, prepped regions A/B unchanged.
9. End session → reload workshop → all regions, including any DM live-paint, persisted.
10. Throttle player to "Slow 3G", repeat toggles: no flicker per existing decode-then-swap rule.

Skip `npm run build` per `feedback_dont_rebuild_reflexively.md`.

---

## Migration Strategy

**Read-side migration (transparent):**
- `MapAsset.get_fog_config()` checks for legacy v1 shape (top-level `mask`, no `regions` key) and rewrites to v2 in-memory before returning.
- A `live` region with no mask is appended automatically if missing — every map has one for ad-hoc paint.

**Write-side migration (one-time on next save):**
- The first save after upgrade writes the v2 shape to PostgreSQL. The legacy fields are dropped.
- No batch migration script needed — natural lazy migration as users edit maps. Old shape support stays in the read path indefinitely; cheap to maintain.

---

## Critical Files

**New:**
- `rollplay/app/fog_management/hooks/useFogRegions.js`
- `rollplay/app/fog_management/components/FogRegionStack.js`
- `rollplay/app/fog_management/components/RegionListPanel.js` — workshop-side and runtime-side region list UI
- `rollplay/app/fog_management/components/RegionParamsEditor.js` — collapsed per-region param sliders
- `rollplay/patch_notes/0.47.0.md`

**Modified:**
- `rollplay-shared-contracts/shared_contracts/map.py` (+ tests)
- `api-site/modules/library/domain/map_asset_aggregate.py`
- `api-site/modules/library/application/commands.py`
- `api-site/modules/library/api/schemas.py`
- `api-site/modules/library/api/endpoints.py`
- `api-game/mapservice.py`
- `api-game/websocket_handlers/websocket_events.py`
- `api-game/websocket_handlers/app_websocket.py`
- `rollplay/app/fog_management/components/FogCanvasLayer.js` — accept render params as props
- `rollplay/app/fog_management/hooks/fogWebSocketEvents.js` — granular event handlers + senders
- `rollplay/app/map_management/components/MapDisplay.js` — `<FogRegionStack>` instead of `<FogCanvasLayer>`
- `rollplay/app/workshop/components/MapConfigTool.js` — region list + per-region params + active-region routing
- `rollplay/app/game/GameContent.js` — runtime region toggles + live-region paint
- `rollplay/app/workshop/hooks/useUpdateFogConfig.js` — split into `useUpdateFogRegion`, `useAddFogRegion`, `useDeleteFogRegion`

---

## Sequencing

Suggested merge order (each step is its own PR, roughly):

1. **Contract + persistence** — `FogRegion`, `FogConfig` v2, aggregate methods, migration on read. No frontend changes; existing UI keeps working with the lazy migration.
2. **`FogCanvasLayer` accepts params as props** — file-level constants stay as defaults. No behaviour change for existing single-mask renders.
3. **`useFogRegions` + `FogRegionStack`** — new orchestration without UI changes yet. Wire into `MapDisplay`. Existing single-region fog renders identically.
4. **Workshop region list UI** — add/rename/delete, active region routing. Auto-save still uses full-list PATCH.
5. **Per-region endpoints + WS events** — granular updates replace full-list broadcasts where useful.
6. **Game runtime toggle UI + live region** — DM controls; player rendering already handled by stack.
7. **Param editor per region** — sliders + colour picker for the previously-global FOG_* constants.

Each step is independently testable and shippable; the user-facing region feature lights up at step 4 and is fully usable by step 6.
