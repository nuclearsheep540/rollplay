/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faHouse, faFileImport, faFloppyDisk, faCheckDouble } from '@fortawesome/free-solid-svg-icons';
import { useRouter } from 'next/navigation';
import { authFetch } from '@/app/shared/utils/authFetch';
import AssetPicker from './AssetPicker';
import MapConfigToolbar from './MapConfigToolbar';
import MapConfigUndoRedo from './MapConfigUndoRedo';
import WorkshopGridControls from './WorkshopGridControls';
import FileMenuBar from './FileMenuBar';
import { MapDisplay } from '@/app/map_management';
import { useGridConfig } from '@/app/map_management/hooks/useGridConfig';
import { useUpdateGridConfig } from '../hooks/useUpdateGridConfig';
import { useUpdateFogConfig } from '../hooks/useUpdateFogConfig';
import { useFogEngine, FogPaintControls } from '@/app/fog_management';
import { useActionHistory } from '@/app/shared/hooks/useActionHistory';

const VALID_TOOLS = ['move', 'grid', 'paint', 'erase'];

async function fetchAssetById(assetId) {
  const response = await authFetch(`/api/library/${assetId}`, { method: 'GET' });
  if (!response.ok) return null;
  return response.json();
}

// Pull the same flat grid shape that grid.toFlatConfig() produces and
// the /grid PATCH endpoint accepts. Symmetric before/after for undo.
function extractGridFlat(asset) {
  if (!asset) return null;
  return {
    grid_width: asset.grid_width ?? null,
    grid_height: asset.grid_height ?? null,
    grid_cell_size: asset.grid_cell_size ?? null,
    grid_offset_x: asset.grid_offset_x ?? null,
    grid_offset_y: asset.grid_offset_y ?? null,
    grid_opacity: asset.grid_opacity ?? null,
    grid_line_color: asset.grid_line_color ?? null,
  };
}

// Pull the FogConfig contract shape from the asset response. null when
// the map has no saved fog (so undo back to "no fog" round-trips).
function extractFog(asset) {
  return asset?.fog_config ?? null;
}

/**
 * Unified Map Config workshop tool — Photoshop-style layout:
 *
 *   ┌── top context menu bar ─────────────────────────────────────┐
 *   │ File ▾                                            [back]    │
 *   ├──┬──────────────────────────────────────────────┬──────────┤
 *   │T │                                              │          │
 *   │o │            map preview + overlays            │  active  │
 *   │o │                                              │   tool   │
 *   │l │                                              │  panel   │
 *   │s │                                              │          │
 *   └──┴──────────────────────────────────────────────┴──────────┘
 *
 * The toolbar drives one piece of state (`activeTool`); everything
 * else (gridEditMode, fogPaintMode, fog engine mode, right-panel
 * contents) is derived from it.
 */
export default function MapConfigTool({
  selectedAssetId,
  activeTool,
  onAssetSelect,
  onToolChange,
  backLabel = 'Workshop',
  onBack,
}) {
  const router = useRouter();
  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [naturalDimensions, setNaturalDimensions] = useState(null);
  const [gridSaveSuccess, setGridSaveSuccess] = useState(false);
  const [fogSaveSuccess, setFogSaveSuccess] = useState(false);

  const grid = useGridConfig();
  const fog = useFogEngine();
  const gridUpdateMutation = useUpdateGridConfig();
  const fogUpdateMutation = useUpdateFogConfig();

  const tool = VALID_TOOLS.includes(activeTool) ? activeTool : 'move';

  // ── Action history (undo/redo) ─────────────────────────────────────
  // Two action kinds with different semantics:
  //   save_grid  — server PATCH + local sync. Created on Save Grid click.
  //   fog_stroke — local canvas swap only, no server. Created on every
  //                stroke / fill / clear in the fog tool.
  // Fog "Save" is a server commit, intentionally not in the history.
  // The strokes are the undo unit; the save just publishes the current
  // canvas state.
  const handlers = useMemo(() => ({
    save_grid: {
      apply: async (payload) => {
        if (!payload) {
          throw new Error('save_grid: clearing grid is not yet supported');
        }
        const updated = await gridUpdateMutation.mutateAsync({
          assetId: selectedAsset?.id,
          gridConfig: payload,
        });
        grid.initFromConfig(payload);
        setSelectedAsset(prev => ({ ...prev, ...updated }));
      },
    },
    fog_stroke: {
      // payload is a base64 PNG data URL — the snapshot to restore.
      apply: async (payload) => {
        await fog.loadDataUrl(payload);
        // Always mark dirty after an undo/redo: the canvas now diverges
        // from whatever the last server commit was, even if it happens
        // to coincide. Easier to enable "Save Fog" defensively than to
        // track equality with the server snapshot.
        if (fog.engine) fog.engine.setDirty(true);
      },
    },
  }), [selectedAsset?.id, grid, fog, gridUpdateMutation]);

  const history = useActionHistory({ handlers, capacity: 10 });

  // Subscribe to the engine's strokeend event. Each completed stroke
  // (or fill/clear bulk op) produces a typed `fog_stroke` action with
  // before/after canvas snapshots.
  useEffect(() => {
    if (!fog.engine) return;
    const onStrokeEnd = ({ before, after, kind }) => {
      const labelByKind = {
        paint: 'Paint stroke',
        erase: 'Reveal stroke',
        fill: 'Fill all',
        clear: 'Clear all',
        stroke: 'Fog stroke',
      };
      history.push({
        kind: 'fog_stroke',
        label: labelByKind[kind] || 'Fog stroke',
        timestamp: Date.now(),
        before,
        after,
      });
    };
    fog.engine.on('strokeend', onStrokeEnd);
    return () => fog.engine.off('strokeend', onStrokeEnd);
  }, [fog.engine, history]);

  // Auto-save: every completed stroke triggers a debounced PATCH so the
  // workshop has a Photoshop-style "always saved" feel — no Update button
  // to remember in this context. The game runtime intentionally still
  // uses the manual Update button (the WS broadcast is a deliberate act).
  //
  // Refs let the stable listener read the latest selected asset / fog /
  // mutation without re-binding on every render. Debounce coalesces fast
  // bursts of strokes into one PATCH and avoids out-of-order requests
  // overwriting newer state with older.
  const selectedAssetRef = useRef(null);
  const fogRef = useRef(null);
  const fogMutationRef = useRef(null);
  selectedAssetRef.current = selectedAsset;
  fogRef.current = fog;
  fogMutationRef.current = fogUpdateMutation;

  useEffect(() => {
    if (!fog.engine) return;
    let timer = null;
    const onStrokeEndAutoSave = () => {
      const asset = selectedAssetRef.current;
      const f = fogRef.current;
      const mutation = fogMutationRef.current;
      if (!asset || !f || !mutation) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        mutation.mutate({
          assetId: asset.id,
          fogConfig: f.serialize(),
        });
      }, 250);
    };
    fog.engine.on('strokeend', onStrokeEndAutoSave);
    return () => {
      fog.engine.off('strokeend', onStrokeEndAutoSave);
      clearTimeout(timer);
    };
  }, [fog.engine]);

  // ── Asset loading ──────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedAssetId) {
      setSelectedAsset(null);
      setNaturalDimensions(null);
      setGridSaveSuccess(false);
      setFogSaveSuccess(false);
      gridUpdateMutation.reset();
      fogUpdateMutation.reset();
      history.clear();
      return;
    }
    if (selectedAsset?.id === selectedAssetId) return;

    let cancelled = false;
    async function load() {
      setLoadingAsset(true);
      setNaturalDimensions(null);
      setGridSaveSuccess(false);
      setFogSaveSuccess(false);
      gridUpdateMutation.reset();
      fogUpdateMutation.reset();
      history.clear(); // a different asset means a different history

      const assetData = await fetchAssetById(selectedAssetId);
      if (cancelled) return;
      if (!assetData) {
        setLoadingAsset(false);
        return;
      }
      setSelectedAsset(assetData);

      // Hydrate grid hook from the flat asset shape
      grid.initFromConfig({
        grid_width: assetData.grid_width,
        grid_height: assetData.grid_height,
        grid_cell_size: assetData.grid_cell_size,
        grid_offset_x: assetData.grid_offset_x,
        grid_offset_y: assetData.grid_offset_y,
        grid_opacity: assetData.grid_opacity,
        grid_line_color: assetData.grid_line_color,
      });

      // Hydrate the fog engine from the persisted mask (if any)
      if (assetData.fog_config?.mask) {
        await fog.loadDataUrl(assetData.fog_config.mask);
      } else {
        await fog.loadDataUrl(null);
      }

      setLoadingAsset(false);
    }
    load();
    return () => { cancelled = true; };
  }, [selectedAssetId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Recompute default cell size when natural dimensions arrive
  useEffect(() => {
    if (!naturalDimensions || !selectedAsset) return;
    if (selectedAsset.grid_cell_size) return;
    grid.initFromConfig({
      grid_width: selectedAsset.grid_width,
      grid_height: selectedAsset.grid_height,
      grid_offset_x: selectedAsset.grid_offset_x,
      grid_offset_y: selectedAsset.grid_offset_y,
      grid_opacity: selectedAsset.grid_opacity,
      grid_line_color: selectedAsset.grid_line_color,
    }, naturalDimensions);
  }, [naturalDimensions]); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch fog engine to the right brush mode whenever the toolbar
  // selects a fog sub-tool. No-op for non-fog tools.
  useEffect(() => {
    if (tool === 'paint') fog.setMode('paint');
    if (tool === 'erase') fog.setMode('erase');
  }, [tool]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save handlers ──────────────────────────────────────────────────
  // Each successful save pushes a typed action to history with both
  // sides captured (before = pre-save server state, after = post-save).
  // Undo replays `before` via the matching handler; redo replays `after`.

  const handleGridSave = async () => {
    if (!selectedAsset) return;
    setGridSaveSuccess(false);
    const before = extractGridFlat(selectedAsset);
    const after = grid.toFlatConfig();
    try {
      const updatedAsset = await gridUpdateMutation.mutateAsync({
        assetId: selectedAsset.id,
        gridConfig: after,
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setGridSaveSuccess(true);
      setTimeout(() => setGridSaveSuccess(false), 3000);
      history.push({
        kind: 'save_grid',
        label: `Save grid (${after.grid_width}×${after.grid_height})`,
        timestamp: Date.now(),
        before,
        after: extractGridFlat(updatedAsset),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mapconfig] grid save failed:', err);
    }
  };

  const handleFogSave = async () => {
    if (!selectedAsset || !fog.engine) return;
    setFogSaveSuccess(false);
    // Save is a server commit only — strokes are the undo unit, so
    // this intentionally does not push to history.
    try {
      const updatedAsset = await fogUpdateMutation.mutateAsync({
        assetId: selectedAsset.id,
        fogConfig: fog.serialize(),
      });
      setSelectedAsset(prev => ({ ...prev, ...updatedAsset }));
      setFogSaveSuccess(true);
      setTimeout(() => setFogSaveSuccess(false), 3000);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error('[mapconfig] fog save failed:', err);
    }
  };

  // ── Keyboard shortcuts: ⌘Z / ⇧⌘Z (Ctrl on non-mac) ─────────────────

  const handleUndoClick = useCallback(() => { history.undo(); }, [history]);
  const handleRedoClick = useCallback(() => { history.redo(); }, [history]);

  useEffect(() => {
    const onKey = (e) => {
      // Ignore when typing in form fields — the editor in those
      // contexts owns Cmd+Z (e.g. text undo inside a color hex input).
      const tag = (document.activeElement?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || document.activeElement?.isContentEditable) return;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) handleRedoClick();
        else handleUndoClick();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [handleUndoClick, handleRedoClick]);

  // ── Derived state for the preview ──────────────────────────────────

  const isFogTool = tool === 'paint' || tool === 'erase';
  const isGridTool = tool === 'grid';
  const isMoveTool = tool === 'move';

  const activeMapForDisplay = useMemo(() => {
    if (!selectedAsset) return null;
    return {
      filename: selectedAsset.filename,
      map_config: {
        file_path: selectedAsset.s3_url,
        file_size: selectedAsset.file_size,
        asset_id: selectedAsset.id,
        filename: selectedAsset.filename,
      },
    };
  }, [selectedAsset?.s3_url, selectedAsset?.file_size, selectedAsset?.id, selectedAsset?.filename]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Top menu items ─────────────────────────────────────────────────

  // "Save All Settings" commits both grid and fog in sequence. Grid
  // always PATCHes (it doesn't track dirty client-side); fog skips its
  // PATCH when nothing was painted since the last save. Either side
  // can fail independently — we intentionally don't wrap them so a
  // grid 409 doesn't block the fog save (or vice versa).
  const handleSaveAll = async () => {
    if (!selectedAsset) return;
    await handleGridSave();
    if (fog.isDirty) await handleFogSave();
  };

  const anySavePending = gridUpdateMutation.isPending || fogUpdateMutation.isPending;

  const fileMenuItems = [
    { label: 'Open Asset', icon: faFileImport, onClick: () => onAssetSelect(null) },
    {
      label: 'Save All Settings',
      icon: faCheckDouble,
      onClick: handleSaveAll,
      disabled: !selectedAsset || anySavePending,
    },
    {
      label: 'Save Grid',
      icon: faFloppyDisk,
      onClick: handleGridSave,
      disabled: !isGridTool || !selectedAsset || gridUpdateMutation.isPending,
    },
    {
      label: 'Save Fog',
      icon: faFloppyDisk,
      onClick: handleFogSave,
      disabled: !isFogTool || !selectedAsset || !fog.isDirty || fogUpdateMutation.isPending,
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────

  // No asset picked: full-bleed picker view (no toolbar / panels).
  if (!selectedAssetId) {
    return (
      <div className="flex flex-col h-full">
        <TopBar onBack={onBack} backLabel={backLabel} fileMenuItems={[]} title="Map Config" />
        <div className="flex-1 min-h-0 p-6 overflow-y-auto">
          <AssetPicker assetType="map" onSelect={(id) => onAssetSelect(id)} />
        </div>
      </div>
    );
  }

  if (loadingAsset || !selectedAsset) {
    return (
      <div className="flex flex-col h-full">
        <TopBar onBack={onBack} backLabel={backLabel} fileMenuItems={[]} title="Map Config" />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-sm text-content-secondary">Loading map…</div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      <TopBar
        onBack={onBack}
        backLabel={backLabel}
        fileMenuItems={fileMenuItems}
        title={selectedAsset.filename}
        history={history}
        onUndo={handleUndoClick}
        onRedo={handleRedoClick}
      />

      <div className="flex-1 min-h-0 flex">
        <MapConfigToolbar activeTool={tool} onToolChange={onToolChange} />

        {/* Center — preview */}
        <div className="flex-1 min-w-0 relative bg-surface-primary border-r border-border">
          <MapDisplay
            activeMap={activeMapForDisplay}
            isEditMode={isGridTool}
            gridConfig={isGridTool ? grid.effectiveGridConfig : null}
            liveGridOpacity={isGridTool ? grid.gridOpacity : null}
            offsetX={grid.offset.x}
            offsetY={grid.offset.y}
            onImageLoad={(dims) => {
              setNaturalDimensions(dims);
              if (!selectedAsset?.fog_config?.mask) {
                fog.fitToMap(dims.naturalWidth, dims.naturalHeight);
              }
            }}
            isMapLocked={isFogTool}
            fogEngine={fog.engine}
            fogPaintMode={isFogTool}
            showGrid={isGridTool || isMoveTool}
          />
        </div>

        {/* Right — tool panel */}
        <div className="w-72 flex-shrink-0 overflow-y-auto bg-surface-secondary">
          {isMoveTool && (
            <div className="p-4 text-xs text-content-secondary leading-relaxed">
              <p className="text-content-on-dark font-semibold mb-2">Move tool</p>
              <p>Click and drag to pan. Scroll or pinch to zoom.</p>
              <p className="mt-3">Pick a tool on the left to start editing this map.</p>
            </div>
          )}

          {isGridTool && (
            <div className="p-3">
              <WorkshopGridControls
                grid={grid}
                onSave={handleGridSave}
                isSaving={gridUpdateMutation.isPending}
                saveSuccess={gridSaveSuccess}
                error={gridUpdateMutation.error?.message}
              />
            </div>
          )}

          {isFogTool && (
            <div className="p-3 space-y-3">
              <div className="text-[11px] uppercase tracking-wider text-content-secondary">
                {tool === 'paint' ? 'Painting fog' : 'Revealing (erasing fog)'}
              </div>
              <FogPaintControls
                paintMode={true}
                mode={fog.mode}
                showEnableToggle={false}
                showModeToggle={false}
                brushSize={fog.brushSize}
                onBrushSizeChange={fog.setBrushSize}
                isDirty={fog.isDirty}
                onClear={fog.clear}
                onFillAll={fog.fillAll}
                /* No onUpdate in workshop — strokes auto-save via the
                   strokeend subscription above. The game runtime still
                   passes onUpdate so its manual button shows. */
                /* No onResetToServer — the workshop's Discard role is
                   replaced by the global undo at the top of the tool. */
                disabled={fogUpdateMutation.isPending}
              />
              {fogSaveSuccess && (
                <div className="text-xs text-emerald-300">✓ Fog mask saved.</div>
              )}
              {fogUpdateMutation.error && (
                <div className="text-xs text-rose-300">{fogUpdateMutation.error.message}</div>
              )}
              <p className="text-[11px] text-content-secondary leading-relaxed">
                Painted fog persists on this map and is restored on the
                next live session. While a session is active, edit fog
                in-game from the DM map panel instead.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Top bar ──────────────────────────────────────────────────────────

function TopBar({ onBack, backLabel, fileMenuItems, title, history, onUndo, onRedo }) {
  const router = useRouter();
  return (
    <>
      <FileMenuBar items={fileMenuItems} />
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-surface-secondary text-xs flex-shrink-0">
        <div className="text-content-secondary uppercase tracking-wider">
          <span className="text-content-on-dark font-semibold">Map Config</span>
          {title && (
            <span className="ml-3 text-content-secondary normal-case tracking-normal">
              {title}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {history && (
            <MapConfigUndoRedo
              canUndo={history.canUndo}
              canRedo={history.canRedo}
              onUndo={onUndo}
              onRedo={onRedo}
              peekUndoLabel={history.peekUndoLabel}
              peekRedoLabel={history.peekRedoLabel}
            />
          )}
          <button
            onClick={() => router.push('/dashboard')}
            className="flex items-center gap-2 px-2.5 py-1 rounded-sm border border-border text-content-secondary hover:bg-surface-elevated hover:text-content-on-dark transition-colors"
          >
            <FontAwesomeIcon icon={faHouse} className="text-[10px]" />
            <span>Dashboard</span>
          </button>
          {onBack && (
            <button
              onClick={onBack}
              className="flex items-center gap-2 px-2.5 py-1 rounded-sm border border-border text-content-secondary hover:bg-surface-elevated hover:text-content-on-dark transition-colors"
            >
              <FontAwesomeIcon icon={faArrowLeft} className="text-[10px]" />
              <span>{backLabel}</span>
            </button>
          )}
        </div>
      </div>
    </>
  );
}
