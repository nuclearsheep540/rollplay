# Plan: Map Lock Overlay + Grid Tuning (Margin & Offset)

## Context

Currently the "Lock Map" button is buried inside `MapDisplay.js` as local-only state — invisible to the right drawer being open, not repositioned when any drawer slides in. Grid editing (size/opacity) is in the MAP drawer, but there are no tools for fine-tuning grid alignment against a pre-drawn grid on a map image, and the grid colour is hardcoded. This plan adds:

1. **MapOverlayPanel** — a persistent, drawer-aware overlay on the map canvas containing just the Lock Map button (all users). The Lock Map state is lifted from MapDisplay into page.js but remains purely local (not broadcast).
2. **Grid Tuning** — two new DM-only sections in the MAP drawer:
   - **Margin**: symmetric per-axis inset (margin_x squeezes left+right simultaneously, margin_y squeezes top+bottom simultaneously). Stored in image-native pixels so they scale correctly at any render size. Visualised via interactive on-map buttons on each grid border face.
   - **Offset**: whole-grid X/Y nudge, bounded to ±half a cell. Same interactive on-map button approach. Applied after margin.
3. **Grid colour picker** — reuses `@melloware/coloris` (already used for seat colours) to let the DM pick a grid line colour in the Edit Grid section of the MAP drawer. Applied and broadcast on "Apply" alongside size/opacity. Persisted to PostgreSQL and restored on session resume. The `GridColorMode.line_color` field already exists in the shared contract — only the PostgreSQL storage and frontend wiring are new.
4. Full data path: on-map → HTTP PUT → MongoDB broadcast → WebSocket → GridOverlay re-render. On Apply also PATCHes PostgreSQL for cross-session persistence. ETL automatically covers both directions (no ETL command changes needed — they call `build_grid_config_for_game()` / `update_grid_config_from_game()` which we're updating in the aggregate).

---

## Critical Design Decisions

### Image-space pixels for margin/offset
Margin and offset are stored in native image pixels (not rendered pixels). GridOverlay computes `renderScale = clientWidth / naturalWidth` at draw time and scales them. This ensures the same margin value looks correct across different player window sizes.

### Coordinate calculation (GridOverlay)
```
labelOffsetX = 30  (existing — space for row labels)
labelOffsetY = 20  (existing — space for column labels)

renderedMarginX = marginX * renderScale
renderedMarginY = marginY * renderScale
renderedOffsetX = offsetX * renderScale
renderedOffsetY = offsetY * renderScale

gridDrawStartX = labelOffsetX + renderedMarginX + renderedOffsetX
gridDrawEndX   = labelOffsetX + mapWidth - renderedMarginX + renderedOffsetX
gridDrawStartY = labelOffsetY + renderedMarginY + renderedOffsetY
gridDrawEndY   = labelOffsetY + mapHeight - renderedMarginY + renderedOffsetY

// Vertical line i:   x = gridDrawStartX + (i / gridCols) * (gridDrawEndX - gridDrawStartX)
// Horizontal line j: y = gridDrawStartY + (j / gridRows) * (gridDrawEndY - gridDrawStartY)
```
SVG already has `overflow: visible` — lines can extend slightly outside bounds when offset is applied.

### Overlay repositioning (snap, no animation)
```javascript
const RIGHT_DRAWER_WIDTH = 320; // px — confirm from .right-drawer CSS
const right = activeRightDrawer ? RIGHT_DRAWER_WIDTH + 16 : 16; // px
```
The overlay is absolutely positioned inside `.grid-area-map-canvas` (not fixed). Left drawer opening doesn't affect it (Lock Map is right-aligned).

### Tuning mode exclusivity
`tuningMode` in page.js is `null | 'margin' | 'offset'`. Only one active at a time. Auto-reset when navigating away from MAP tab (same pattern as `gridEditMode` at page.js:473).

### Pointer event isolation for on-map buttons
GridTuningOverlay renders as an absolutely-positioned div at the SAME level as the SVG, inside the transform container. Its buttons call `e.stopPropagation()` on `onPointerDown` to prevent triggering the pan drag on the parent container.

### Offset bounds
Bounded to `±Math.floor(cellSize / 2)` where `cellSize` is the rendered cell size at config time (not re-clamped on every resize — the stored value is in image pixels and bounded at apply time).

### Grid colour — Coloris event isolation
Coloris fires `coloris:pick` on the document for ALL open pickers. The grid colour input **must** check `event.target === gridColorInputRef.current` to avoid interfering with seat colour pickers. No cooldown — colour is only sent on explicit Apply, not on every pick. Both `edit_mode` and `display_mode` `line_color` receive the same value (single colour for both modes).

The `GridColorMode.line_color` contract field already exists in `shared_contracts/map.py`. The new work is: PostgreSQL column, aggregate field, API schema field, and the MapControlsPanel inline picker. `GridOverlay.js` already reads `baseColors.line_color` — no change needed there.

---

## Files Changed

### Backend — 7 files (+ 1 auto-generated migration)

**1. `rollplay-shared-contracts/shared_contracts/map.py`**
Add to `GridConfig`:
```python
margin_x: int = Field(default=0, ge=0)  # Inset per side on X axis (image px)
margin_y: int = Field(default=0, ge=0)  # Inset per side on Y axis (image px)
offset_x: int = 0  # Whole-grid X shift (image px, can be negative)
offset_y: int = 0  # Whole-grid Y shift (image px, can be negative)
```

**2. `api-site/modules/library/model/map_asset_model.py`**
Add 5 new nullable columns to `MapAssetModel`:
```python
grid_margin_x  = Column(Integer, nullable=True)
grid_margin_y  = Column(Integer, nullable=True)
grid_offset_x  = Column(Integer, nullable=True)
grid_offset_y  = Column(Integer, nullable=True)
grid_line_color = Column(String(20), nullable=True)  # hex colour e.g. "#d1d5db"
```

**3. Alembic migration (auto-generated)**
```bash
docker exec api-site-dev alembic revision --autogenerate -m "add grid tuning and colour fields to map_assets"
```

**4. `api-site/modules/library/domain/map_asset_aggregate.py`**
- Add 5 new optional fields to dataclass: 4 int (default None) + `grid_line_color: Optional[str] = None`
- Update `from_base()` — add 5 new kwargs
- Update `update_grid_config()` — add params; validate margin ≥ 0; validate colour is valid hex if provided
- Update `build_grid_config_for_game()` — include margin/offset fields (default 0 when None); apply `grid_line_color` to both `edit_mode` and `display_mode` `GridColorMode` (falls back to "#d1d5db")
- Update `update_grid_config_from_game()` — extract margin/offset fields; extract `line_color` from `display_mode` colors

**5. `api-site/modules/library/api/schemas.py`**
Add to `UpdateGridConfigRequest`:
```python
grid_margin_x:   Optional[int] = Field(None, ge=0)
grid_margin_y:   Optional[int] = Field(None, ge=0)
grid_offset_x:   Optional[int] = None
grid_offset_y:   Optional[int] = None
grid_line_color: Optional[str] = None  # hex e.g. "#d1d5db"
```

**6. `api-site/modules/library/application/commands.py`**
Find the `UpdateGridConfig` command's `execute()` — pass all 5 new fields through to `aggregate.update_grid_config()`.

**7. `api-site/modules/library/repositories/asset_repository.py`**
Update 3 locations:
- `save()` update branch for `MapAsset` — add 5 `existing.grid_*` assignments (lines ~115-118)
- `save()` create branch for `MapAsset` — add 5 kwargs to `MapAssetModel(...)` (lines ~141-154)
- `_model_to_aggregate()` — add 5 kwargs to `MapAsset.from_base(...)` (lines ~249-255)

---

### Frontend — 7 files (2 new)

**8. `rollplay/app/map_management/components/GridOverlay.js`**
- Add props: `marginX = 0`, `marginY = 0`, `offsetX = 0`, `offsetY = 0`
- Compute `renderScale = mapElement.clientWidth / (mapImageRef.current?.naturalWidth || mapElement.clientWidth)` inside `gridData` useMemo
- Replace existing fixed `offsetX = 30` / `offsetY = 20` references with the new `gridDrawStart*` / `gridDrawEnd*` variables derived from the formula above
- Labels and edit-mode indicator text stay at fixed positions (unaffected by grid tuning)

**9. NEW `rollplay/app/game/components/MapOverlayPanel.js`**
Extracted from the Lock Map button in MapDisplay. Responsibilities:
- Position: `absolute`, `top: 16px`, `right` computed from `activeRightDrawer` (snap, no transition)
- Props: `isMapLocked`, `onToggleLock`, `activeRightDrawer`, `activeMap`
- Renders the Lock Map button with same colour/style as current (`rgba(139,69,19,0.9)` locked / `rgba(34,139,34,0.9)` unlocked)
- Shows regardless of whether map is loaded; button is disabled (greyed out) with no map

**10. NEW `rollplay/app/map_management/components/GridTuningOverlay.js`**
Interactive on-map controls, rendered INSIDE the transform container in MapDisplay (so they pan/zoom with the map).
- Props: `mode` ('margin'|'offset'), `mapImageRef`, `marginX`, `marginY`, `offsetX`, `offsetY`, `maxOffsetX`, `maxOffsetY`, `onMarginXChange(delta)`, `onMarginYChange(delta)`, `onOffsetXChange(delta)`, `onOffsetYChange(delta)`
- Renders as `position: absolute, top:0, left:0, right:0, bottom:0, pointerEvents: none` wrapper
- Each button: `pointerEvents: auto`, calls `e.stopPropagation()` on `onPointerDown`

**Margin mode buttons** (4 buttons, one per border face):
```
Top button:    center-X of grid, Y = gridDrawStartY — arrow ↓ inward — +/- for marginY
Bottom button: center-X of grid, Y = gridDrawEndY   — arrow ↑ inward — +/- for marginY
Left button:   X = gridDrawStartX, center-Y of grid — arrow → inward — +/- for marginX
Right button:  X = gridDrawEndX,   center-Y of grid — arrow ← inward — +/- for marginX
```
Since X and Y are linked per axis, both top & bottom buttons adjust `marginY`, both left & right adjust `marginX`.

**Offset mode buttons** (4 directional, centered on grid):
```
↑ button: center of grid — decrements offsetY by 1
↓ button: center of grid — increments offsetY by 1
← button: center of grid — decrements offsetX by 1
→ button: center of grid — increments offsetX by 1
```
Clamped to `[-maxOffsetX, +maxOffsetX]` and `[-maxOffsetY, +maxOffsetY]`.

Button style: dark semi-transparent pill (`rgba(0,0,0,0.75)`, white text, rounded), compact (~32×32px for directional, wider for margin labels).

**11. `rollplay/app/game/components/MapControlsPanel.js`**

**Grid colour picker** — added inside the existing "Edit Grid" collapsible section (alongside size and opacity sliders):
- New local state: `liveGridColor` (default `'#d1d5db'`; synced from `activeMap.grid_config.colors.display_mode.line_color` in the existing sync `useEffect`)
- `gridColorInputRef` — ref on the colour input for Coloris event isolation
- Coloris is dynamically imported (same pattern as `ColorPicker.js`) via a `useEffect` scoped to `isDimensionsExpanded`
- Event handler: `if (event.target !== gridColorInputRef.current) return;` — prevents cross-contamination with seat colour pickers
- Rendered as a small `<input type="text" className="custom-color-input" ref={gridColorInputRef} value={liveGridColor} readOnly />` with a coloured border swatch (same style as `ColorPicker.js`)
- `liveGridColor` is included in `createGridFromDimensions()` applied to both `edit_mode` and `display_mode` `line_color` — this means the live preview also reflects the picked colour during edit mode
- On Apply (`applyGridDimensions`): PATCH body includes `grid_line_color: liveGridColor`

New props:
- `tuningMode` (null|'margin'|'offset')
- `liveTuning` ({ marginX, marginY, offsetX, offsetY })
- `onTuningModeChange(mode)` — callback
- `onMarginChange(marginX, marginY)` — fires on every button press (live preview)
- `onOffsetChange(offsetX, offsetY)` — fires on every button press (live preview)

New sections (below existing "Edit Grid" toggle):

**"Grid Margin" collapsible** (disabled when no activeMap):
- On expand: read initial values from `activeMap.grid_config.margin_x / margin_y`; call `onTuningModeChange('margin')`
- On collapse: call `onTuningModeChange(null)`; restore original values
- Label shows current values: "X: ±{marginX}px per side, Y: ±{marginY}px per side"
- Apply button: calls `applyTuning()` with current margin + existing offset

**"Grid Offset" collapsible** (disabled when no activeMap):
- On expand: read initial from `activeMap.grid_config.offset_x / offset_y`; call `onTuningModeChange('offset')`
- Computes `maxOffset = { x: Math.floor(cellPixelWidth/2), y: Math.floor(cellPixelHeight/2) }` using `imageDimensions` and current grid config
- Label: "X: {offsetX}px, Y: {offsetY}px (bounded ±{maxOffsetX}px / ±{maxOffsetY}px)"
- Apply button: calls `applyTuning()` with current offset + existing margin

**`applyTuning()`** function:
```javascript
// Same flow as existing applyGridDimensions
const colors = {
  edit_mode:    { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
  display_mode: { line_color: liveGridColor, opacity: liveGridOpacity, line_width: 1 },
};
const updatedMap = {
  ...activeMapWithoutId,
  grid_config: {
    ...activeMap.grid_config,
    margin_x: marginX,
    margin_y: marginY,
    offset_x: offsetX,
    offset_y: offsetY,
    colors,
  }
};
// 1. PUT /api/game/{roomId}/map (MongoDB hot + WebSocket broadcast)
// 2. PATCH /api/library/{assetId}/grid (PostgreSQL cold)
//    — body includes grid_margin_x, grid_margin_y, grid_offset_x, grid_offset_y, grid_line_color
```
On success: call `onTuningModeChange(null)` to exit mode.

**12. `rollplay/app/map_management/components/MapDisplay.js`**
- Remove internal `isMapLocked` state (line 29)
- Remove Lock Map button JSX (lines 237-268)
- Add props: `isMapLocked`, `marginX = 0`, `marginY = 0`, `offsetX = 0`, `offsetY = 0`, `tuningMode = null`
- Pass `marginX/Y`, `offsetX/Y` through to `GridOverlay`
- Inside the transform container, render `GridTuningOverlay` when `tuningMode !== null`:
  ```jsx
  {tuningMode && (
    <GridTuningOverlay
      mode={tuningMode}
      mapImageRef={mapImageRef}
      marginX={marginX} marginY={marginY}
      offsetX={offsetX} offsetY={offsetY}
      maxOffsetX={maxOffsetX} maxOffsetY={maxOffsetY}
      onMarginXChange={onMarginXChange}
      onMarginYChange={onMarginYChange}
      onOffsetXChange={onOffsetXChange}
      onOffsetYChange={onOffsetYChange}
    />
  )}
  ```
  Callbacks (`onMarginXChange` etc.) are passed from page.js.

**13. `rollplay/app/game/page.js`**
New state:
```javascript
const [isMapLocked, setIsMapLocked] = useState(false);
const [tuningMode, setTuningMode] = useState(null);        // null | 'margin' | 'offset'
const [liveTuning, setLiveTuning] = useState({ marginX: 0, marginY: 0, offsetX: 0, offsetY: 0 });
```

Initialise `liveTuning` from `activeMap` when it changes:
```javascript
useEffect(() => {
  if (!activeMap?.grid_config) return;
  const gc = activeMap.grid_config;
  setLiveTuning({
    marginX: gc.margin_x ?? 0,
    marginY: gc.margin_y ?? 0,
    offsetX: gc.offset_x ?? 0,
    offsetY: gc.offset_y ?? 0,
  });
}, [activeMap]);
```

Auto-reset tuning mode when navigating away from Map tab (after existing `gridEditMode` reset at ~line 473):
```javascript
if (activeRightDrawer !== 'map' && tuningMode) {
  setTuningMode(null);
}
```

Computed effective grid config for `MapDisplay` (tuning preview takes priority over edit mode preview):
```javascript
const effectiveGridConfig = tuningMode
  ? { ...(activeMap?.grid_config || {}), margin_x: liveTuning.marginX, margin_y: liveTuning.marginY, offset_x: liveTuning.offsetX, offset_y: liveTuning.offsetY }
  : (gridEditMode && gridConfig) ? gridConfig
  : activeMap?.grid_config;
```

Render `MapOverlayPanel` inside `.grid-area-map-canvas`:
```jsx
<MapOverlayPanel
  isMapLocked={isMapLocked}
  onToggleLock={() => setIsMapLocked(prev => !prev)}
  activeRightDrawer={activeRightDrawer}
  activeMap={activeMap}
/>
```

Pass new props to `MapDisplay`:
```jsx
<MapDisplay
  isMapLocked={isMapLocked}
  gridConfig={effectiveGridConfig}
  marginX={liveTuning.marginX}
  marginY={liveTuning.marginY}
  offsetX={liveTuning.offsetX}
  offsetY={liveTuning.offsetY}
  tuningMode={tuningMode}
  onMarginXChange={(delta) => setLiveTuning(prev => ({ ...prev, marginX: Math.max(0, prev.marginX + delta) }))}
  onMarginYChange={(delta) => setLiveTuning(prev => ({ ...prev, marginY: Math.max(0, prev.marginY + delta) }))}
  onOffsetXChange={(delta, max) => setLiveTuning(prev => ({ ...prev, offsetX: Math.max(-max, Math.min(max, prev.offsetX + delta)) }))}
  onOffsetYChange={(delta, max) => setLiveTuning(prev => ({ ...prev, offsetY: Math.max(-max, Math.min(max, prev.offsetY + delta)) }))}
  ...existingProps
/>
```

Pass new props to `MapControlsPanel`:
```jsx
<MapControlsPanel
  tuningMode={tuningMode}
  liveTuning={liveTuning}
  onTuningModeChange={setTuningMode}
  onMarginChange={(mx, my) => setLiveTuning(prev => ({ ...prev, marginX: mx, marginY: my }))}
  onOffsetChange={(ox, oy) => setLiveTuning(prev => ({ ...prev, offsetX: ox, offsetY: oy }))}
  ...existingProps
/>
```

**14. `rollplay/app/map_management/index.js`**
Export new component:
```javascript
export { default as GridTuningOverlay } from './components/GridTuningOverlay';
```
`MapOverlayPanel` lives in `app/game/components/` so doesn't need to be exported from here.

---

## Bug Fix (spotted during research)
`MapControlsPanel.js:264` — `applyGridDimensions` uses plain `fetch` for `PUT /api/game/{roomId}/map`. api-game may not require auth — **do not change unless confirmed broken**.

---

## Implementation Order
1. ~~Backend data layer (Steps 1–7) — establish the schema first~~ **DONE**
2. ~~Run migration + restart api-site to verify columns exist~~ **DONE** — migration `c568ca6b6711`, all 5 columns confirmed
3. `GridOverlay.js` — pure rendering logic, verifiable in isolation
4. `GridTuningOverlay.js` — new component, no external deps yet
5. `MapOverlayPanel.js` — simple extraction
6. `MapDisplay.js` — wire new props, remove lock button
7. `MapControlsPanel.js` — new sections
8. `page.js` — orchestration
9. `index.js` — exports

### Implementation Notes
- `build_grid_config_for_game()` uses conditional kwargs pattern (only passes non-None values) so Pydantic's `GridConfig` defaults hydrate margin/offset to 0 — no `or 0` fallbacks in domain code
- Removed spurious `ix_campaign_members_user_id_role` index drop/create from auto-generated migration (unrelated drift)
- `endpoints.py` also updated to wire all 5 new request fields through to the command
- `MapAssetResponse` schema also updated with 5 new fields for API responses

---

---

## Phase 2 — Margin Removal, Cell Size Model, Unified Panel

### Motivation
- Margin was designed for the "squeeze" model but is mathematically redundant with offset under the fixed-cell-size model — both are pure origin shifts.
- Grid size slider controlled column/row count (a derived value), not the true user-facing concept of cell size.
- Offset was bounded to ±half a cell, preventing meaningful alignment on maps with large decorative borders.
- Two separate Apply clicks (grid size + offset) with no way to see them interact before committing.

### Design Decisions

**Cell size as the primary control**
`grid_width` / `grid_height` stored in PostgreSQL/MongoDB now represent the base column/row count for a full-width grid with no offset — i.e. they define cell size. At render time `GridOverlay` computes:
```
cellSize    = min(mapWidth / storedGridCols, mapHeight / storedGridRows)
renderCols  = ceil((mapWidth  - offsetX) / cellSize)
renderRows  = ceil((mapHeight - offsetY) / cellSize)
```
Cell size is therefore stable across offset changes. Adjusting offset drops/adds boundary cells automatically.

**Offset unbounded (within map)**
Old ±halfCell bound removed. Offset can be any value that keeps the grid covering the map. Clamping applied only to prevent the origin moving so far that zero cells remain visible.

**Unified panel**
Single "Edit Grid" collapsible containing: cell size slider + XY offset d-pad + opacity slider + colour picker. All controls update `liveTuning` for real-time preview. One Apply commits everything.

**MapSafeArea**
New `MapSafeArea` component wraps all floating overlay elements (lock button, tuning d-pad). It responds to all three drawers (left party drawer, right panel drawer, bottom mixer) so each overlay element uses simple `top/bottom/left/right: 16px` without any drawer awareness.

**HoldButton**
`GridTuningOverlay` buttons use `HoldButton`: fires once on press, then repeatedly at 50ms after a 100ms hold delay. Works on touch and mouse.

### Files Changed

**Backend — remove margin fields**
1. `rollplay-shared-contracts/shared_contracts/map.py` — remove `margin_x`, `margin_y` from `GridConfig`
2. `rollplay-shared-contracts/tests/test_contracts.py` — remove margin fields from fixtures and constraint tests
3. `api-site/modules/library/model/map_asset_model.py` — remove `grid_margin_x`, `grid_margin_y` columns
4. Alembic migration — `DROP COLUMN grid_margin_x, grid_margin_y` from `map_assets`
5. `api-site/modules/library/domain/map_asset_aggregate.py` — remove fields, validation, ETL kwargs
6. `api-site/modules/library/api/schemas.py` — remove from `UpdateGridConfigRequest` and `MapAssetResponse`
7. `api-site/modules/library/application/commands.py` — remove params
8. `api-site/modules/library/repositories/asset_repository.py` — remove 6 lines

**Frontend — unified panel + rendering**
9. `rollplay/app/map_management/components/GridOverlay.js` — fixed-cell-size rendering with auto col/row count from offset
10. `rollplay/app/game/components/MapControlsPanel.js` — unified Edit Grid section; remove margin section; remove `applyTuning()`; d-pad lives in panel (not overlay) or triggers overlay; single Apply
11. `rollplay/app/map_management/components/GridTuningOverlay.js` — remove margin mode entirely; offset d-pad only (or remove entirely if d-pad moves to panel)
12. `rollplay/app/game/page.js` — remove `marginX/Y` from `liveTuning`; remove `onMarginXChange/YChange`; update offset callbacks to use unbounded clamp
13. `rollplay/app/game/components/MapSafeArea.js` — ✅ already implemented
14. `rollplay/app/game/components/MapOverlayPanel.js` — ✅ already simplified

### Implementation Order
1. Shared contracts + tests
2. Backend stack (aggregate → schema → command → repo → model → migration)
3. `GridOverlay.js` rendering logic
4. `MapControlsPanel.js` unified panel
5. `GridTuningOverlay.js` margin mode removal
6. `page.js` state cleanup

---

## Verification

**Backend:**
- `docker exec api-site-dev alembic current` — confirms migration applied
- `docker exec postgres-dev psql -U postgres -d rollplay -c "\d map_assets"` — confirm 5 new columns exist (`grid_margin_x/y`, `grid_offset_x/y`, `grid_line_color`)
- `PATCH /api/library/{assetId}/grid` with all new fields — verify 200 and values round-trip
- Start a session → check MongoDB `active_sessions` doc has `grid_config.margin_x`, `offset_x`, and `colors.display_mode.line_color` fields

**Frontend:**
- Load map → expand "Edit Grid" → colour picker swatch visible; pick a colour → live preview grid lines change colour immediately
- Press Apply → grid colour persists; other players see the new colour via WebSocket
- Expand "Grid Margin" → margin buttons appear on each grid border face
- Press + on top margin button → top and bottom grid lines visibly squeeze inward simultaneously
- Press apply → grid stays in position; open another session and verify it restores
- Offset buttons shift entire grid; locked to ±half cell
- Close MAP drawer → overlay controls disappear, grid stays in applied position
- Right drawer open → Lock Map button snaps to left of drawer (not hidden underneath)
- Players see Lock Map button; DM sees same + grid tuning sections in MAP drawer
- Session pause + resume → margin/offset/colour values restored from PostgreSQL
- No seat colour picker interference: seat colour changes do not affect grid colour state
