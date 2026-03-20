# Plan: Map Lock Overlay + Grid Tuning

---

## Phase 1 — DONE: Original Grid Tuning (Margin, Offset, Colour)

Added MapOverlayPanel (lock button), grid margin/offset controls as on-map interactive
buttons, grid colour picker, and full data path (HTTP PUT → MongoDB → WebSocket →
GridOverlay). Margin/offset stored in image-native pixels. GridColorMode.line_color
wired through PostgreSQL, aggregate, ETL, and frontend.

Migration `c568ca6b6711` — all 5 columns confirmed (`grid_margin_x/y`, `grid_offset_x/y`,
`grid_line_color`).

---

## Phase 2 — DONE: Change in Direction — Margin Removal, Cell Size Model, Unified Panel

### Why the direction changed
Margin was mathematically redundant with offset under a fixed-cell-size model — both
are pure origin shifts. The grid size slider controlled column/row count (a derived
value), not the user-facing concept of cell size. Offset was bounded to ±half a cell,
preventing meaningful alignment on maps with large borders.

### What changed
- **Margin removed** from schema, model, aggregate, API, and frontend
- **Cell size** (`grid_cell_size`) added as the primary control — stored as native image px
- **Offset unbounded** — can shift the entire grid across the map
- **Unified Edit Grid panel** — single collapsible with cell size slider, offset d-pad,
  opacity slider, colour picker, one Apply
- **MapSafeArea** — new component making overlay elements drawer-aware
- **HoldButton** — hold-to-repeat button extracted to `app/shared/components/HoldButton.js`
- **GridTuningOverlay** — offset d-pad only (margin mode removed)

---

## Phase 3 — DONE: Change in Direction — GridOverlay Cell-First Rewrite

### Why the direction changed
The GridOverlay after Phase 2 was still a pixel-math engine, not a grid. The `gridData`
useMemo conflated scale conversion, origin math, span math, clip bounds, and generation
loops with no concept of a cell. Labels were positioned by a separate formula that broke
as soon as offset was applied. The architecture couldn't support future features (token
placement, cell addressing).

### What was built
**`GridOverlay.js` — full rewrite** around a cell-first model:

- `layout` useMemo — pure math returning `{ cellSize, originX, originY, gridCols, gridRows, mapBounds }`
- `cells` useMemo — generates `Cell[]` where each cell has `{ col, row, x1, y1, x2, y2 }`; a cell is only included if both edges are fully within mapBounds (no partial cells)
- SVG rendering entirely derived from cells — `<rect>` per cell, labels at actual cell centers
- Exported `cellBounds(col, row, layout)` and `cellAtPoint(px, py, layout)` — foundation for future token placement

**`page.js` cleanups:**
- `effectiveGridConfig` IIFE → clean `useMemo`
- `liveTuning` sync depends on `activeMap?.grid_config` not the whole `activeMap`

**Anchor change:** origin switched from center-anchor to top-left anchor:
```javascript
// Before (center-anchor — caused grid to shift when adding/removing cols/rows)
originX = LABEL_OFFSET_X + (mapWidth - cellSize * gridCols) / 2 + offsetX * renderScale;

// After (top-left anchor — adding cols/rows extends outward, origin stays fixed)
originX = LABEL_OFFSET_X + offsetX * renderScale;
```

---

## Phase 4 — DONE: Independent Column/Row Trim + D-Pad Labels

Added `−col`/`+col` and `−row`/`+row` trim buttons to `GridTuningOverlay`, absorbed
into `grid_width`/`grid_height` on Apply (no new schema fields). Cell size buttons
relabelled from `−`/`+` to `Cell Size: Decrease`/`Increase` with line breaks, widened
to match d-pad width (146px), font reduced from 22px to 18px.

D-pad hold now fires 2px per tick (vs 1px on initial press) via `holdAction` prop on
`HoldButton`.

Col/row labels changed from `−col`/`+col` symbols to `Column\nRemove` / `Column\nAdd`
format.

---

## Files Changed (all phases)

| File | Status |
|------|--------|
| `rollplay-shared-contracts/shared_contracts/map.py` | margin added then removed; `grid_cell_size` added |
| `api-site/modules/library/model/map_asset_model.py` | margin cols added then removed; offset/colour/cell_size added |
| `api-site/modules/library/domain/map_asset_aggregate.py` | full grid config ETL updated |
| `api-site/modules/library/api/schemas.py` | grid fields updated through each phase |
| `api-site/modules/library/application/commands.py` | UpdateGridConfig updated |
| `api-site/modules/library/repositories/asset_repository.py` | save/load updated |
| `rollplay/app/map_management/components/GridOverlay.js` | full rewrite (Phase 3) |
| `rollplay/app/map_management/components/GridTuningOverlay.js` | margin removed; trim added; labels updated |
| `rollplay/app/shared/components/HoldButton.js` | new — extracted + holdAction prop |
| `rollplay/app/game/components/MapControlsPanel.js` | unified Edit Grid panel |
| `rollplay/app/game/components/MapSafeArea.js` | new |
| `rollplay/app/game/components/MapOverlayPanel.js` | new (lock button) |
| `rollplay/app/game/page.js` | state lifted; effectiveGridConfig; liveTuning |
