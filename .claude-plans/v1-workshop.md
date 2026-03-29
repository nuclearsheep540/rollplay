# Workshop — Dashboard Authoring Space

## Context

Media Foundation V1 has 3 of 4 features shipped (F1: Image Loading, F2: SFX Soundboard, F3: Audio Effects). F4 (Loop Points + Waveform + BPM) is the final piece. Simultaneously, map grid config has a working backend API (`PATCH /api/library/{asset_id}/grid`) but zero frontend UI for preparation-time use — it's only accessible in-game.

The Workshop is a new dashboard tab and frontend slice (`rollplay/app/workshop/`) that serves as the DM's **preparation-time authoring space**. It's where DMs configure assets before sessions — loop points on audio, grid overlays on maps, and eventually NPCs, items, scenes.

**Two deliverables:**
1. **Part 1 (this plan):** Workshop shell + Map Grid Tool
2. **Part 2 (follow-up):** F4 Audio Loop Editor with wavesurfer.js

---

## Part 1: Workshop Shell + Map Grid Tool

### Phase 0 — Backend: Complete Grid API

The `PATCH /api/library/{asset_id}/grid` endpoint exists but has two gaps that block Workshop use:

**Gap 1: `grid_cell_size` not wired through the API layer.**
The domain model (`MapAsset.grid_cell_size`) and DB column (`MapAssetModel.grid_cell_size`) exist, and `MapAsset.update_grid_config()` already accepts `grid_cell_size` as a parameter. But the API request schema, command `execute()`, and endpoint handler never pass it through.

**Gap 2: Response serializer is incomplete.**
`_to_media_asset_response()` (endpoints.py:70-86) only returns `grid_width`, `grid_height`, `grid_opacity` for map assets — it omits `grid_offset_x`, `grid_offset_y`, `grid_line_color`, `grid_cell_size` even though `MapAssetResponse` has the fields defined. The Workshop can't initialize the grid editor for a previously configured map without these values.

#### 0.1 Add `grid_cell_size` to Request Schema

**`api-site/modules/library/api/schemas.py` — `UpdateGridConfigRequest`:**
Add field:
```python
grid_cell_size: Optional[int] = Field(None, ge=8, le=500, description="Cell size in native image pixels")
```

**`api-site/modules/library/api/schemas.py` — `MapAssetResponse`:**
Add field:
```python
grid_cell_size: Optional[int] = None
```

#### 0.2 Wire `grid_cell_size` Through Command + Endpoint

**`api-site/modules/library/application/commands.py` — `UpdateGridConfig.execute()`:**
Add `grid_cell_size: Optional[int] = None` parameter, pass it to `asset.update_grid_config()`.

**`api-site/modules/library/api/endpoints.py` — `update_grid_config()` handler (line 404-412):**
Add `grid_cell_size=request.grid_cell_size` to the command call.

#### 0.3 Fix Response Serializer

**`api-site/modules/library/api/endpoints.py` — `_to_media_asset_response()` (line 70-86):**
The `MapAssetResponse` construction is missing fields. Add:
```python
grid_offset_x=asset.grid_offset_x,
grid_offset_y=asset.grid_offset_y,
grid_line_color=asset.grid_line_color,
grid_cell_size=asset.grid_cell_size,
```

No migration needed — columns already exist.

**Files modified:**
- `api-site/modules/library/api/schemas.py` — add `grid_cell_size` to request + response
- `api-site/modules/library/application/commands.py` — wire `grid_cell_size` through
- `api-site/modules/library/api/endpoints.py` — wire `grid_cell_size` in handler, fix serializer

---

### Phase 1 — Shared Grid Hook (extract from game context)

#### Where grid state actually lives

The grid editing state is **not** in `MapControlsPanel.js`. It's spread across two locations:

**`GameContent.js` (lines 174-203)** — owns all core grid state as `useState`:
- `liveCellSize` (line 200) — cell size in native image px
- `liveGridCols` (line 201) — column count
- `liveGridRows` (line 202) — row count
- `liveGridOpacity` (line 178) — opacity value
- `liveTuning` (line 199) — `{ offsetX, offsetY }`
- `gridEditMode` (line 176) — edit mode flag
- `tuningMode` (line 198) — null | 'offset'
- `mapNaturalDimensions` (line 203) — `{ naturalWidth, naturalHeight }`

**`GameContent.js` (lines 590-639)** — owns initialization and preview computation:
- Sync effect (lines 590-598): when `activeMap.grid_config` changes, hydrates `liveTuning`, `liveGridCols`, `liveGridRows`, `liveCellSize` from the stored config
- Default cell size effect (lines 600-609): when no stored `grid_cell_size`, computes default from image dimensions + grid dimensions
- `effectiveGridConfig` useMemo (lines 620-639): merges live editing state into a preview config object (the nested shape that `MapDisplay`/`GridOverlay` consume)

**`MapControlsPanel.js`** — only owns locally:
- `liveGridColor` (line 87) — color hex string
- `isDimensionsExpanded` (line 78) — panel open/closed
- `originalServerOpacity` (line 81) — for cancel/restore
- `originalTuning` (line 91) — for cancel/restore
- Coloris color picker initialization (lines 124-159)
- `applyGrid()` (lines 191-243) — persists to MongoDB via `PUT /api/game/${roomId}/map`
- Live preview effect (lines 107-122) — calls `handleGridChange` to push color/opacity into `gridConfig` state

**`GameContent.js`** passes state down to `MapControlsPanel` as props (lines 1775-1794):
```
liveGridOpacity, setLiveGridOpacity, liveTuning, cellSize={liveCellSize},
onCellSizeChange, liveGridCols, liveGridRows, gridEditMode, setGridEditMode, handleGridChange
```

And passes derived state to `MapDisplay` (lines 1848-1861):
```
gridConfig={effectiveGridConfig}, liveGridOpacity, offsetX={liveTuning.offsetX}, offsetY={liveTuning.offsetY}
```

And to `GridTuningOverlay` (lines 1879-1885):
```
onOffsetXChange, onOffsetYChange, onCellSizeChange, onColChange, onRowChange
```

#### 1.1 Create `useGridConfig` Hook (`rollplay/app/map_management/hooks/useGridConfig.js`)

Extracts the grid parameter state and preview computation from `GameContent.js`. This hook owns **no persistence logic** — it doesn't know about WebSocket, MongoDB, or REST.

**State** (from GameContent.js lines 178, 198-203):
- `cellSize` — cell size in native image pixels (default 64)
- `gridCols` — column count (default 10)
- `gridRows` — row count (default 10)
- `gridOpacity` — opacity 0.0-1.0 (default 0.2)
- `gridColor` — hex string (default '#d1d5db') — **moved from MapControlsPanel**
- `offset` — `{ x, y }` (default { x: 0, y: 0 })

**Actions** (from GameContent.js lines 1791, 1880-1884 — the inline callbacks):
- `setCellSize(value)` / `adjustCellSize(delta)` — with clamp 8-100
- `setGridCols(value)` / `adjustGridCols(delta)` — with min 2
- `setGridRows(value)` / `adjustGridRows(delta)` — with min 2
- `setGridOpacity(value)`
- `setGridColor(hex)`
- `adjustOffset(deltaX, deltaY)`

**Init** (from GameContent.js lines 590-609):
- `initFromConfig(gridConfig, naturalDimensions?)` — hydrates all state from a saved config object. Works with two shapes:
  - **Nested (MongoDB/game)**: `{ grid_width, grid_height, grid_cell_size, offset_x, offset_y, colors: { display_mode: { line_color, opacity } } }`
  - **Flat (REST API response)**: `{ grid_width, grid_height, grid_cell_size, grid_offset_x, grid_offset_y, grid_opacity, grid_line_color }`
  - If no `grid_cell_size` and `naturalDimensions` provided: compute default cell size as `Math.max(8, Math.min(naturalWidth / cols, naturalHeight / rows))`

**Derived** (from GameContent.js lines 620-639):
- `effectiveGridConfig` — the nested config object for `MapDisplay`/`GridOverlay` preview:
  ```js
  { grid_width, grid_height, grid_cell_size, enabled: true, offset_x, offset_y,
    colors: { edit_mode: { line_color, opacity, line_width: 1 },
              display_mode: { line_color, opacity, line_width: 1 } } }
  ```
- `toFlatConfig()` — transforms state into the flat shape for `PATCH /api/library/{id}/grid`:
  ```js
  { grid_width, grid_height, grid_cell_size, grid_opacity, grid_offset_x, grid_offset_y, grid_line_color }
  ```

The two output shapes serve different consumers:
- `effectiveGridConfig` → `MapDisplay` (gridConfig prop) and `GridOverlay` (both Game and Workshop preview)
- `toFlatConfig()` → `useUpdateGridConfig` mutation (Workshop REST save only)

#### 1.2 Refactor `GameContent.js`

Replace the scattered `useState` declarations (lines 178, 198-202), the sync effect (lines 590-598), the default cell size effect (lines 600-609), and the `effectiveGridConfig` useMemo (lines 620-639) with `useGridConfig`.

**Before** (GameContent.js):
```js
const [liveGridOpacity, setLiveGridOpacity] = useState(0.2);
const [liveTuning, setLiveTuning] = useState({ offsetX: 0, offsetY: 0 });
const [liveCellSize, setLiveCellSize] = useState(64);
const [liveGridCols, setLiveGridCols] = useState(10);
const [liveGridRows, setLiveGridRows] = useState(10);
// + sync effects + effectiveGridConfig useMemo
```

**After** (GameContent.js):
```js
const grid = useGridConfig();
// grid.cellSize, grid.gridCols, grid.gridRows, grid.gridOpacity, grid.gridColor, grid.offset
// grid.effectiveGridConfig — replaces the useMemo
// grid.initFromConfig(activeMap?.grid_config, mapNaturalDimensions)
```

GameContent still owns: `gridEditMode`, `tuningMode`, `gridConfig` (the raw config state set by `handleGridChange`), `mapNaturalDimensions`. The hook replaces the live editing state and preview computation.

The inline delta callbacks (lines 1791, 1880-1884) become hook action calls:
```js
onCellSizeChange={(delta) => grid.adjustCellSize(delta)}
onColChange={(delta) => grid.adjustGridCols(delta)}
```

#### 1.3 Refactor `MapControlsPanel.js`

- Remove `liveGridColor` local state (line 87) — now comes from hook via props
- Remove the Coloris-based live preview `useEffect` (lines 107-122) — the hook's `effectiveGridConfig` handles this
- The `applyGrid` function (lines 191-243) stays — it reads from props (which now come from the hook) and sends to `PUT /api/game/${roomId}/map`
- The Coloris color picker initialization (lines 124-159) stays — it calls the hook's `setGridColor` instead of local `setLiveGridColor`
- The opacity/color sync effect (lines 94-104) is replaced by the hook's `initFromConfig`

**Prop changes to MapControlsPanel:**
- Remove: `liveGridOpacity`, `setLiveGridOpacity`, `liveTuning`, `cellSize`, `onCellSizeChange`, `liveGridCols`, `liveGridRows`, `handleGridChange`
- Add: `grid` (the hook instance) — or spread individual values as props

**Files modified:**
- `rollplay/app/map_management/hooks/useGridConfig.js` — **new**
- `rollplay/app/map_management/index.js` — export the new hook
- `rollplay/app/game/GameContent.js` — consume hook, remove scattered state + effects + useMemo
- `rollplay/app/game/components/MapControlsPanel.js` — consume hook values via props, remove local `liveGridColor`

---

### Phase 2 — Frontend Slice Foundation

Create the `workshop/` slice with internal sub-navigation.

#### 2.1 Directory Structure
```
rollplay/app/workshop/
  index.js                          # Barrel export: WorkshopManager
  components/
    WorkshopManager.js               # Top-level orchestrator
    WorkshopToolNav.js               # Internal tool switcher (Audio / Maps)
    AssetPicker.js                   # Filtered asset selector, reuses useAssets
    MapGridTool.js                   # Map grid config orchestrator
    WorkshopGridControls.js          # Grid editing panel (REST-only, uses shared useGridConfig)
  hooks/
    useUpdateGridConfig.js           # TanStack mutation → PATCH /api/library/{id}/grid
```

#### 2.2 WorkshopManager (`components/WorkshopManager.js`)
- Reads `tool` and `asset_id` query params for deep-linking from Library context menu
- Renders `WorkshopToolNav` for internal switching between tools
- Conditionally renders `MapGridTool` (or placeholder for Audio tool)
- Props: `{ user }` — same pattern as `AssetLibraryManager`
- Clears deep-link params after consuming them (same pattern as `clearInviteCampaignId` in `page.js:45-49`)

#### 2.3 WorkshopToolNav (`components/WorkshopToolNav.js`)
- Internal navigation: "Audio" (disabled/coming soon in Part 1) and "Maps"
- Styled with Tailwind tokens — follows the category tabs pattern in `AssetLibraryManager.js:24-28`
- Not a SubNav — rendered within the workshop content area

#### 2.4 AssetPicker (`components/AssetPicker.js`)
- Uses `useAssets({ assetType })` from `asset_library/hooks/useAssets.js`
- Compact list/grid of assets filtered to the relevant type
- Click selects as active asset for the current tool
- Shows selected asset name, type badge, "Change" button

#### 2.5 Dashboard Tab Wiring

**`rollplay/app/dashboard/components/DashboardLayout.js`:**
- Add `{ id: 'workshop', label: 'Workshop' }` to tabs array (line 31-36)
- Add `'workshop'` to validation list in useEffect (line 41)

**`rollplay/app/dashboard/page.js`:**
- Import: `import { WorkshopManager } from '../workshop'`
- Add conditional render block after library section:
  ```jsx
  {activeSection === 'workshop' && (
    <section className="flex-1 flex flex-col min-h-0">
      <WorkshopManager user={user} />
    </section>
  )}
  ```

---

### Phase 3 — Map Grid Tool

#### 3.1 useUpdateGridConfig Hook (`hooks/useUpdateGridConfig.js`)
- TanStack `useMutation` calling `PATCH /api/library/${assetId}/grid` via `authFetch`
- Sends the flat config shape from `grid.toFlatConfig()`:
  ```js
  { grid_width, grid_height, grid_cell_size, grid_opacity, grid_offset_x, grid_offset_y, grid_line_color }
  ```
- On success: invalidate `['assets']` query key (keeps Library tab in sync)
- On 409 error: surface "map is in an active session" message

#### 3.2 MapGridTool (`components/MapGridTool.js`)
- Renders `AssetPicker` filtered to `assetType="map"`
- When a map is selected:
  - Instantiates `useGridConfig` shared hook
  - Calls `initFromConfig()` with the asset's flat grid fields from the API response (Phase 0 ensures all fields are returned):
    ```js
    grid.initFromConfig({
      grid_width: asset.grid_width,
      grid_height: asset.grid_height,
      grid_cell_size: asset.grid_cell_size,
      grid_offset_x: asset.grid_offset_x,
      grid_offset_y: asset.grid_offset_y,
      grid_opacity: asset.grid_opacity,
      grid_line_color: asset.grid_line_color,
    }, naturalDimensions)
    ```
  - **Preview**: Render `MapDisplay` from `map_management`, passing:
    - `activeMap` — constructed from asset data (needs `file_path: asset.s3_url`, `grid_config: grid.effectiveGridConfig`)
    - `gridConfig={grid.effectiveGridConfig}` — the nested preview config
    - `isEditMode={true}`
    - `liveGridOpacity={grid.gridOpacity}`
    - `offsetX={grid.offset.x}`, `offsetY={grid.offset.y}`
    - `onImageLoad` — capture natural dimensions for default cell size computation
  - **No separate GridOverlay import** — `MapDisplay` renders `GridOverlay` internally via its `gridConfig` prop
  - **Controls**: Render `WorkshopGridControls`, passing the hook's state + setters
- Empty state when no asset selected

#### 3.3 WorkshopGridControls (`components/WorkshopGridControls.js`)
- Grid editing UI — same controls as in-game (cell size slider, opacity, color picker, offset readout)
- Receives `useGridConfig` state + setters as props (pure presentation, no persistence logic)
- Color picker: uses Coloris (same as in-game) — initialization logic follows MapControlsPanel pattern (lines 124-159), calling `grid.setGridColor` on pick event
- "Save" button calls `useUpdateGridConfig` mutation with `grid.toFlatConfig()` output
- All saves go directly to PostgreSQL via REST — this is preparation-time, not live-session
- `GridTuningOverlay` from `map_management` rendered as a sibling overlay on the map preview area (not inside WorkshopGridControls), with callbacks wired to:
  ```js
  onOffsetXChange={(delta) => grid.adjustOffset(delta, 0)}
  onOffsetYChange={(delta) => grid.adjustOffset(0, delta)}
  onCellSizeChange={(delta) => grid.adjustCellSize(delta)}
  onColChange={(delta) => grid.adjustGridCols(delta)}
  onRowChange={(delta) => grid.adjustGridRows(delta)}
  ```

---

### Phase 4 — Library-to-Workshop Bridge

#### 4.1 Context Menu Items (`rollplay/app/asset_library/components/AssetLibraryManager.js`)
In `getContextMenuItems` (~line 168-237), add:
- For `asset_type === 'map'`: "Configure Grid" → navigates to `?tab=workshop&tool=maps&asset_id={id}`
- For `asset_type === 'music'`: "Edit Loop Points" → navigates to `?tab=workshop&tool=audio&asset_id={id}` (links to Workshop but Audio tool shows "coming soon" until Part 2)

Uses `router.push()` to switch dashboard tab and pass deep-link params.

---

## Part 2: F4 Audio Loop Editor (follow-up plan, not implemented here)

High-level scope for the subsequent deliverable.

### Loop Mode Design

Currently `looping` is a `bool` on `AudioChannelState`. With loop points, there are three distinct playback behaviors. We model this as an enum rather than inferring behavior from `looping + loop_start presence`:

```
LoopMode:
  "off"     — track plays once and stops
  "full"    — track loops the entire file (current `true` behavior)
  "region"  — track plays from 0:00, then loops between loop_start/loop_end
```

**Changes needed:**
- `AudioChannelState` shared contract (`rollplay-shared-contracts/shared_contracts/audio.py`): replace `looping: bool` with `loop_mode: LoopMode` enum. Add `loop_start: Optional[float]`, `loop_end: Optional[float]`
- `MusicAssetModel` ORM model (`api-site/modules/library/model/music_asset_model.py`): add `loop_start`, `loop_end`, `bpm` columns + `loop_mode` column
- `MusicAsset` aggregate (`api-site/modules/library/domain/music_asset_aggregate.py`): add fields, `update_loop_config()` domain method, extend `build_channel_state_for_game()`
- Frontend loop toggle: cycle button through `off → full → region` (region only available when loop points are configured)

**Backwards compatibility**: existing `looping: true` maps to `loop_mode: "full"`, `looping: false` maps to `loop_mode: "off"`. Migration path is straightforward.

### Backend
- Add `loop_start`, `loop_end`, `bpm`, `loop_mode` columns to `MusicAssetModel`
- Add `update_loop_config()` domain method on `MusicAsset` aggregate
- Add `UpdateLoopConfig` command
- Add `PATCH /api/library/{asset_id}/loop-config` endpoint
- Alembic migration for new columns
- Wire into `build_channel_state_for_game()` for ETL

### Frontend (Workshop audio tool)
- Install `wavesurfer.js` + `@wavesurfer/react`
- `AudioLoopTool.js` — orchestrator with AssetPicker filtered to music
- `WaveformEditor.js` — using `useWavesurfer` hook + `RegionsPlugin` for draggable loop markers
- BPM detection: `shared/utils/detectBPM.js` using `OfflineAudioContext` onset detection (wavesurfer.js does not include BPM — use `wavesurfer.getDecodedData()` to feed a custom detector)
- `useUpdateLoopConfig.js` — TanStack mutation hook
- Snap-to-beat: calculated from BPM, constrains marker drag positions

### Game-side integration
- `useUnifiedAudio.js`: when `loop_mode === "region"`, set `source.loopStart` / `source.loopEnd` (native Web Audio API)
- Loop toggle button cycles through 3 states with visual indicator
- `remote_audio_batch` gets a `loop_mode` operation alongside existing `loop` operation

---

## Key Files

### Modify (Part 1)
| File | Change |
|------|--------|
| `api-site/modules/library/api/schemas.py` | Add `grid_cell_size` to request + response schemas |
| `api-site/modules/library/application/commands.py` | Wire `grid_cell_size` through `UpdateGridConfig.execute()` |
| `api-site/modules/library/api/endpoints.py` | Wire `grid_cell_size` in handler + fix `_to_media_asset_response()` serializer |
| `rollplay/app/game/GameContent.js` | Replace scattered grid state/effects/useMemo with `useGridConfig` hook |
| `rollplay/app/game/components/MapControlsPanel.js` | Consume grid state via props from hook, remove local `liveGridColor` |
| `rollplay/app/dashboard/components/DashboardLayout.js` | Add workshop tab + validation |
| `rollplay/app/dashboard/page.js` | Import WorkshopManager, add conditional render |
| `rollplay/app/asset_library/components/AssetLibraryManager.js` | Add context menu items for Workshop bridge |
| `rollplay/app/map_management/index.js` | Export new `useGridConfig` hook |

### Create (Part 1)
| File | Purpose |
|------|---------|
| `rollplay/app/map_management/hooks/useGridConfig.js` | Shared grid state + preview computation (used by both Game and Workshop) |
| `rollplay/app/workshop/index.js` | Barrel export |
| `rollplay/app/workshop/components/WorkshopManager.js` | Top-level orchestrator |
| `rollplay/app/workshop/components/WorkshopToolNav.js` | Internal tool navigation |
| `rollplay/app/workshop/components/AssetPicker.js` | Filtered asset selector |
| `rollplay/app/workshop/components/MapGridTool.js` | Map grid config orchestrator |
| `rollplay/app/workshop/components/WorkshopGridControls.js` | Grid editing panel |
| `rollplay/app/workshop/hooks/useUpdateGridConfig.js` | TanStack mutation for grid config |

### Reuse (no changes)
| File | How Used |
|------|----------|
| `rollplay/app/asset_library/hooks/useAssets.js` | AssetPicker queries via `useAssets({ assetType: 'map' })` |
| `rollplay/app/map_management/components/MapDisplay.js` | Map preview in grid tool (renders GridOverlay internally) |
| `rollplay/app/map_management/components/GridTuningOverlay.js` | D-pad offset/size controls overlaid on map preview |
| `rollplay/app/shared/utils/authFetch.js` | All API calls |
| `rollplay/app/styles/colorTheme.js` | THEME tokens for styling |

---

## Verification

### Part 1 Checklist
1. **Backend grid_cell_size**: `PATCH /api/library/{id}/grid` with `grid_cell_size` field → returns full grid config including cell_size, offsets, color
2. **Response completeness**: `GET /api/assets/` returns `grid_cell_size`, `grid_offset_x`, `grid_offset_y`, `grid_line_color` for map assets
3. **Shared hook works in-game**: Existing grid editing in game sessions behaves identically after refactor to `useGridConfig`
4. **Workshop tab visible**: Navigate to `/dashboard?tab=workshop` — tab appears in SubNav, content renders
5. **Tool nav**: "Maps" tool is active, "Audio" shows coming soon state
6. **Asset picker**: Shows only map assets, selecting one loads the preview
7. **Map preview**: Selected map renders with `MapDisplay` + live grid overlay from `effectiveGridConfig`
8. **Grid controls**: Sliders/inputs for cell size, rows, cols, opacity, color, offset all functional with live preview
9. **Save persists**: Click save → `PATCH /api/library/{id}/grid` with flat config succeeds → reload shows saved config (including cell_size)
10. **Active session guard**: If map is in an active session, save returns 409 and UI shows appropriate message
11. **Library bridge**: Right-click a map in Library → "Configure Grid" → navigates to Workshop with map pre-selected
12. **Deep-linking**: Direct URL `?tab=workshop&tool=maps&asset_id={uuid}` opens the correct tool with the correct asset
13. **`npm run build`**: Clean production build with no warnings
