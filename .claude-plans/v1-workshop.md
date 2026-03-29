# Workshop — Dashboard Authoring Space

## Context

Media Foundation V1 has 3 of 4 features shipped (F1: Image Loading, F2: SFX Soundboard, F3: Audio Effects). F4 (Loop Points + Waveform + BPM) is the final piece. Simultaneously, map grid config has a working backend API (`PATCH /api/library/{asset_id}/grid`) but zero frontend UI for preparation-time use — it's only accessible in-game.

The Workshop is a new dashboard tab and frontend slice (`rollplay/app/workshop/`) that serves as the DM's **preparation-time authoring space**. It's where DMs configure assets before sessions — loop points on audio, grid overlays on maps, and eventually NPCs, items, scenes.

**Two deliverables:**
1. **Part 1 (this plan):** Workshop shell + Map Grid Tool (backend exists, frontend only)
2. **Part 2 (follow-up):** F4 Audio Loop Editor with wavesurfer.js

---

## Part 1: Workshop Shell + Map Grid Tool

### Phase 1 — Shared Grid Hook (extract from game context)

Currently, grid config state logic lives inline in `MapControlsPanel.js` (lines 78-122) — local state for cols, rows, cellSize, opacity, color, offset, plus a `useEffect` that pushes preview updates via `handleGridChange`. This is tightly coupled to the game session.

**Extract a shared `useGridConfig` hook** into `map_management/hooks/` that both Game and Workshop can consume.

#### 1.1 Create `useGridConfig` Hook (`rollplay/app/map_management/hooks/useGridConfig.js`)

Manages pure grid parameter state and preview computation:
- **State**: `gridCols`, `gridRows`, `cellSize`, `gridOpacity`, `gridColor`, `offset { x, y }`
- **Actions**: `setCellSize`, `setGridOpacity`, `setGridColor`, `adjustOffset`, `setGridDimensions`
- **Derived**: `buildGridConfig()` — returns the complete grid config object (same shape both Game and Workshop need)
- **Init**: `initFromConfig(gridConfig)` — hydrates state from an existing config (loaded from MongoDB in-game, or from asset API response in Workshop)

This hook owns **no persistence logic** — it doesn't know about WebSocket, MongoDB, or REST. It just manages the grid parameter state and preview shape.

#### 1.2 Refactor `MapControlsPanel.js`

Replace the inline state management (lines 78-122) with `useGridConfig`. The `applyGrid` function (line 191-243) stays in `MapControlsPanel` — it calls `buildGridConfig()` from the hook and sends to `PUT /api/game/${roomId}/map`.

**Files modified:**
- `rollplay/app/map_management/hooks/useGridConfig.js` — **new**
- `rollplay/app/map_management/index.js` — export the new hook
- `rollplay/app/game/components/MapControlsPanel.js` — consume the hook, remove inline state

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

### Phase 3 — Map Grid Tool

No backend work needed — `PATCH /api/library/{asset_id}/grid` already exists with full validation and active-session guards.

#### 3.1 useUpdateGridConfig Hook (`hooks/useUpdateGridConfig.js`)
- TanStack `useMutation` calling `PATCH /api/library/${assetId}/grid` via `authFetch`
- On success: invalidate `['assets']` query key (keeps Library tab in sync)

#### 3.2 MapGridTool (`components/MapGridTool.js`)
- Renders `AssetPicker` filtered to `assetType="map"`
- When a map is selected:
  - Calls `useGridConfig` shared hook, initialized via `initFromConfig(asset.grid_config)`
  - **Preview**: Import `MapDisplay` from `map_management` — pass asset's download URL + `buildGridConfig()` output
  - **Grid overlay**: Import `GridOverlay` from `map_management` for live preview
  - **Controls**: Render `WorkshopGridControls`, passing the hook's state + setters
- Empty state when no asset selected

#### 3.3 WorkshopGridControls (`components/WorkshopGridControls.js`)
- Grid editing UI — same controls as in-game (cell size slider, opacity, color picker, offset)
- Receives `useGridConfig` state + setters as props (pure presentation, no persistence logic)
- "Save" button calls `useUpdateGridConfig` mutation with `buildGridConfig()` output
- All saves go directly to PostgreSQL via REST — this is preparation-time, not live-session
- Import `GridTuningOverlay` from `map_management` for on-map d-pad offset controls

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
| `rollplay/app/game/components/MapControlsPanel.js` | Refactor to consume shared `useGridConfig` hook |
| `rollplay/app/dashboard/components/DashboardLayout.js` | Add workshop tab + validation |
| `rollplay/app/dashboard/page.js` | Import WorkshopManager, add conditional render |
| `rollplay/app/asset_library/components/AssetLibraryManager.js` | Add context menu items for Workshop bridge |
| `rollplay/app/map_management/index.js` | Export new `useGridConfig` hook |

### Create (Part 1)
| File | Purpose |
|------|---------|
| `rollplay/app/map_management/hooks/useGridConfig.js` | Shared grid state logic (used by both Game and Workshop) |
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
| `rollplay/app/map_management/components/MapDisplay.js` | Map preview in grid tool |
| `rollplay/app/map_management/components/GridOverlay.js` | Grid overlay on map preview |
| `rollplay/app/map_management/components/GridTuningOverlay.js` | D-pad offset controls |
| `rollplay/app/shared/utils/authFetch.js` | All API calls |
| `rollplay/app/styles/colorTheme.js` | THEME tokens for styling |

### Backend (no changes in Part 1)
The grid config endpoint already exists: `PATCH /api/library/{asset_id}/grid` in `api-site/modules/library/api/endpoints.py:387-429`

---

## Verification

### Part 1 Checklist
1. **Shared hook works in-game**: Existing grid editing in game sessions behaves identically after refactor to `useGridConfig`
2. **Workshop tab visible**: Navigate to `/dashboard?tab=workshop` — tab appears in SubNav, content renders
3. **Tool nav**: "Maps" tool is active, "Audio" shows coming soon state
4. **Asset picker**: Shows only map assets, selecting one loads the preview
5. **Map preview**: Selected map renders with `MapDisplay` + `GridOverlay`
6. **Grid controls**: Sliders/inputs for cell size, rows, cols, opacity, color, offset all functional with live preview
7. **Save persists**: Click save → `PATCH /api/library/{id}/grid` succeeds → reload shows saved config
8. **Active session guard**: If map is in an active session, save returns 409 and UI shows appropriate message
9. **Library bridge**: Right-click a map in Library → "Configure Grid" → navigates to Workshop with map pre-selected
10. **Deep-linking**: Direct URL `?tab=workshop&tool=maps&asset_id={uuid}` opens the correct tool with the correct asset
11. **`npm run build`**: Clean production build with no warnings
