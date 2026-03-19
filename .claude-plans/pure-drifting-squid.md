# Plan: GridOverlay — Ground-Up Cell-First Redesign + Targeted Cleanup

## Context

`GridOverlay.js` is architecturally wrong. It is a pixel-math engine, not a grid. The `gridData` useMemo (~115 lines) conflates six concerns in one block: scale conversion, origin math, span math, extension logic, clip bounds, and two unrelated generation loops. There is no cell concept — just index variables iterating pixel intervals. Labels are positioned by a separate formula that doesn't know about the cells and breaks as soon as offset is applied.

This plan is a full rewrite of `GridOverlay.js` (cell-first model), plus targeted cleanup of adjacent spaghetti identified during investigation.

Additionally, cells must be indexable: "cell at column B, row 7" must be a real addressable coordinate, supporting future placement of tokens and markers.

---

## Cell Coordinate System

Each cell has a stable logical identity:
- `col` — 0-indexed column (col 0 = 'A', col 1 = 'B', etc.)
- `row` — 0-indexed row (row 0 = row label '1', row 4 = row label '5', etc.)

This coordinate is **viewport-independent**. "Cell (2, 4)" = column C, row 5, regardless of window size or zoom. Pixel bounds change with the viewport; logical address doesn't.

**This is the foundation for all future placement features.** A token stored as `{ col: 2, row: 4 }` can always be rendered at the correct position by asking the layout for its bounds.

---

## Part 1: GridOverlay.js — Full Rewrite

### Props (unchanged)
```javascript
const GridOverlay = ({
  gridConfig = null,     // { grid_width, grid_height, enabled, colors, offset_x, offset_y }
  isEditMode = false,
  showLabels = true,
  activeMap = null,
  mapImageRef = null,
  liveGridOpacity = null,
  offsetX = 0,           // Live offset in image-native pixels (from liveTuning in page.js)
  offsetY = 0,
})
```

### Internal structure — clean separation

**1. Dimension tracking (two clean useEffects)**
- `windowSize` — triggers rerender on window resize
- `mapDimensions` — ResizeObserver on mapImageRef.current

**2. `layout` (useMemo)** — pure layout math, single named object:
```javascript
{
  cellSize,    // px — square cell size, constrained by shorter map dimension
  originX,     // px — top-left of cell (0,0) in SVG space (centered + offset applied)
  originY,
  gridCols,    // from gridConfig.grid_width
  gridRows,    // from gridConfig.grid_height
  mapBounds,   // { left, right, top, bottom } in SVG space
  labelOffsetX, labelOffsetY,  // 30, 20 — space for labels
}
```

Math:
```javascript
const renderScale = mapWidth / (mapElement.naturalWidth || mapWidth);
const cellSize    = Math.min(mapWidth / gridCols, mapHeight / gridRows);
const originX     = labelOffsetX + (mapWidth  - cellSize * gridCols) / 2 + offsetX * renderScale;
const originY     = labelOffsetY + (mapHeight - cellSize * gridRows) / 2 + offsetY * renderScale;
```

**3. `cells` (useMemo, depends on layout)** — the core primitive:
```javascript
// Cell = { col, row, x1, y1, x2, y2 }
// Included ONLY if BOTH edges are fully within mapBounds — no partial cells, ever

for (let col = 0; col < gridCols; col++) {
  for (let row = 0; row < gridRows; row++) {
    const x1 = originX + col * cellSize;
    const x2 = originX + (col + 1) * cellSize;
    const y1 = originY + row * cellSize;
    const y2 = originY + (row + 1) * cellSize;
    if (x1 >= mapBounds.left  && x2 <= mapBounds.right &&
        y1 >= mapBounds.top   && y2 <= mapBounds.bottom) {
      cells.push({ col, row, x1, y1, x2, y2 });
    }
  }
}
```

**4. Bi-directional helpers (pure functions at module scope)** — exported for future use
```javascript
// Logical → pixel: given a (col, row) and layout, return pixel bounds
export function cellBounds(col, row, layout) { ... }

// Pixel → logical: given a click position, return (col, row) or null
export function cellAtPoint(px, py, layout) { ... }
```

**5. SVG rendering — entirely derived from cells**

- `<rect fill="none">` per visible cell (stroke, strokeWidth, opacity from currentColors)
- Column labels: `x = originX + (col + 0.5) * cellSize` — actual cell center
- Row labels: `y = originY + (row + 0.5) * cellSize` — actual cell center
- Edit mode indicators unchanged

**Remove entirely:** auto-extend logic (leftExt/rightExt/topExt/bottomExt), clip bounds, the `lines[]` / `labels[]` dual-loop structure.

---

## Part 2: Targeted Cleanup

### 2a. Extract `HoldButton` to shared components

**Why**: `HoldButton` (currently embedded in `GridTuningOverlay.js` lines 37–66) is a clean, reusable hold-to-repeat button pattern that has no dependency on the grid. It belongs in shared and will likely be needed elsewhere (combat controls, audio volume hold-buttons, etc.).

**Action**:
- Create `rollplay/app/shared/components/HoldButton.js`
- Import it in `GridTuningOverlay.js` (removes ~30 lines from that file)
- Export from `rollplay/app/shared/index.js` (or equivalent shared export)

### 2b. Fix `effectiveGridConfig` IIFE in page.js (line 503–508)

**Why**: An immediately-invoked function expression (IIFE) obscures the intent and doesn't benefit from React's memoisation.

**Action**: Convert to a clean `useMemo`:
```javascript
const effectiveGridConfig = useMemo(() => {
  const base = (gridEditMode && gridConfig) ? gridConfig : activeMap?.grid_config;
  if (!base) return null;
  if (tuningMode) return { ...base, offset_x: liveTuning.offsetX, offset_y: liveTuning.offsetY };
  return base;
}, [gridEditMode, gridConfig, activeMap?.grid_config, tuningMode, liveTuning]);
```

### 2c. Fix `liveTuning` sync dependency in page.js (lines 490–498)

**Why**: The useEffect depends on `activeMap` (the whole object), which re-fires on any activeMap change (map load, lock state, etc.) even when grid_config hasn't changed.

**Action**: Depend on `activeMap?.grid_config` specifically:
```javascript
useEffect(() => {
  if (!activeMap?.grid_config) return;
  const gc = activeMap.grid_config;
  setLiveTuning({ offsetX: gc.offset_x ?? 0, offsetY: gc.offset_y ?? 0 });
}, [activeMap?.grid_config]); // ← not the whole activeMap
```

---

## Deferred (not this plan)

These are real issues but out of scope here to avoid over-engineering:
- `useMapGridTuning()` hook — consolidating all grid state in page.js
- `useApplyGridConfig()` hook — extracting applyGrid from MapControlsPanel
- `useImageDimensions()` hook — deduplicating ImageDimensions component
- `useMapPanZoom()` hook — extracting MapDisplay drag handlers

---

## Files Changed

| File | Change |
|------|--------|
| `rollplay/app/map_management/components/GridOverlay.js` | Full rewrite |
| `rollplay/app/shared/components/HoldButton.js` | New file (extracted from GridTuningOverlay) |
| `rollplay/app/map_management/components/GridTuningOverlay.js` | Import HoldButton from shared, remove inline def |
| `rollplay/app/game/page.js` | IIFE → useMemo, fix liveTuning deps |

---

## Verification

1. Default load (no offset) → grid centered on map, all cells visible, labels A…X and 1…N match cells exactly
2. D-pad right 2+ cells → left columns disappear cleanly, labels start from correct letter
3. D-pad down 2+ cells → top rows disappear cleanly, row numbers start from correct value
4. Offset so large no cells fit → nothing renders, no crash
5. Grid size change via overlay → cell count changes, layout recalculates, labels correct
6. Window resize / drawer open-close → grid recalculates via ResizeObserver
7. (Future) Token at col=2, row=4 → `cellBounds(2, 4, layout)` returns correct pixel rect
8. Check page.js: changing map lock state no longer triggers liveTuning sync
