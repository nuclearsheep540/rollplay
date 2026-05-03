/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import FogEngine from '../engine/FogEngine';

// Mirror of FOG_REGIONS_MAX in rollplay-shared-contracts/shared_contracts/map.py.
// Keep in sync — the server-side contract enforces the same cap on PATCH.
const FOG_REGIONS_MAX = 12;

/**
 * useFogRegions — React adapter for managing 1..N independent fog regions.
 *
 * Each region owns its own FogEngine instance (one canvas per mask) plus
 * metadata (name, enabled, role, render params). One region is "active"
 * at a time — paint/erase/clear/fillAll target only the active engine.
 *
 * Designed to be a near-drop-in replacement for useFogEngine in single-
 * region callers: it surfaces the active engine's mode/brushSize/isDirty/
 * maskDims to React, just like the older hook, so existing UI keeps
 * working without changes. Multi-region UI lives in step 4.
 *
 * Storage shape (matches shared_contracts.map.FogRegion):
 *   { id, name, enabled, role, mask, mask_width, mask_height,
 *     hide_feather_px, texture_dilate_px, opacity }
 *
 * Engines live outside React state in a Map<regionId, FogEngine>; only
 * region metadata + activeId flow through useState. Engines are reused
 * across renders, so the no-flicker contract holds (the canvas is never
 * remounted; loads decode-then-swap).
 */

const DEFAULT_REGION_DEFAULTS = {
  name: 'Default',
  enabled: true,
  role: 'prepped',
  mask: null,
  mask_width: null,
  mask_height: null,
  hide_feather_px: 20,
  texture_dilate_px: 30,
  opacity: 1.0,
};

function makeDefaultRegion() {
  // Stable id 'default' for the implicit single region — matches the
  // engine's serialize() fallback so saves before/after the multi-region
  // refactor target the same row.
  return { id: 'default', ...DEFAULT_REGION_DEFAULTS };
}

// Region id generator. Browser crypto.randomUUID is widely available;
// fall back to a short random hex for older environments.
function generateRegionId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'r_' + Math.random().toString(36).slice(2, 12);
}

function regionsFromConfig(fogConfig) {
  const incoming = fogConfig?.regions ?? [];
  return incoming.length > 0 ? incoming : [makeDefaultRegion()];
}

export function useFogRegions({ width = 1024, height = 1024, initialConfig = null } = {}) {
  // Region metadata only — engines live in enginesRef below.
  const [regions, setRegions] = useState(() => regionsFromConfig(initialConfig));
  const [activeId, setActiveId] = useState(() => regions[0]?.id ?? null);

  // Engine pool. One FogEngine per region id; created lazily, destroyed
  // when a region is removed.
  const enginesRef = useRef(new Map());

  // Tool state — brush size and mode belong to the user's painting
  // tool, not to any one region. Lives in React state at the hook
  // level; setBrushSize/setMode push to every engine in the pool so
  // switching active region doesn't surface stale per-engine values.
  const [mode, setModeState] = useState('paint');
  const [brushSize, setBrushSizeState] = useState(40);
  const [isDirty, setIsDirty] = useState(false);
  const [maskDims, setMaskDims] = useState({ width, height });

  // Refs so engine-creation paths can read the latest tool state
  // without depending on every callback in their closure deps.
  const brushSizeRef = useRef(brushSize);
  const modeRef = useRef(mode);
  brushSizeRef.current = brushSize;
  modeRef.current = mode;

  // Mirror of maskDims for engine creation: createEngine needs the
  // current map dims, but the closure-captured `width, height` props
  // are the hook's defaults (1024×1024). Without this, regions added
  // AFTER fitToMap would get square 1024² engines while region 1 had
  // already been resized to match the map — drift in the shared
  // texture's union mask compositor (it doesn't stretch per-region
  // masks, so smaller canvases don't fill the union).
  const maskDimsRef = useRef({ width, height });
  maskDimsRef.current = maskDims;

  // Helper: create a FogEngine pre-configured with the current tool
  // state and at the current map dims. Used everywhere we instantiate
  // one — keeps brush/mode/dims in lockstep across all engines from
  // the start.
  const createEngine = useCallback(() => {
    const dims = maskDimsRef.current;
    const eng = new FogEngine({ width: dims.width, height: dims.height });
    eng.setBrushSize(brushSizeRef.current);
    eng.setMode(modeRef.current);
    return eng;
  }, []);

  const getOrCreateEngine = useCallback((regionId) => {
    if (typeof window === 'undefined') return null;
    let eng = enginesRef.current.get(regionId);
    if (!eng) {
      eng = createEngine();
      enginesRef.current.set(regionId, eng);
    }
    return eng;
  }, [createEngine]);

  // Ensure each region has an engine; dispose engines whose regions
  // were removed. Runs whenever regions change (add/remove flows).
  useEffect(() => {
    const map = enginesRef.current;
    const keepIds = new Set(regions.map((r) => r.id));
    for (const id of Array.from(map.keys())) {
      if (!keepIds.has(id)) {
        map.delete(id); // engines are off-DOM canvases; GC handles them
      }
    }
    for (const r of regions) {
      if (!map.has(r.id)) {
        map.set(r.id, createEngine());
      }
    }
  }, [regions, createEngine]);

  // Subscribe to the active engine so its state surfaces into React.
  // Re-binds when the active id changes — different engine, fresh
  // listeners.
  useEffect(() => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (!eng) return;

    // Sync only mask state from the new active region — tool state
    // (brush size, mode) is hook-owned and shared across engines, so
    // switching regions must NOT overwrite it from the engine.
    setIsDirty(eng.isDirty);
    setMaskDims({ width: eng.width, height: eng.height });

    const onChange = () => setIsDirty(eng.isDirty);
    const onLoad = ({ width: w, height: h, cleared } = {}) => {
      setIsDirty(false);
      if (!cleared && w && h) setMaskDims({ width: w, height: h });
    };

    eng.on('change', onChange);
    eng.on('load', onLoad);

    return () => {
      eng.off('change', onChange);
      eng.off('load', onLoad);
    };
  }, [activeId]);

  // ── Paint ops ───────────────────────────────────────────────────────
  //
  // Brush size and mode are tool-level (the workshop's painting tool),
  // NOT per-region. We push to every engine in the pool so switching
  // active region doesn't surface a different engine's stale brush
  // state. Per-region state is just the mask + render params; the
  // brush belongs to the user's tool, not the surface.

  const activeEngine = activeId ? enginesRef.current.get(activeId) ?? null : null;

  const setMode = useCallback((m) => {
    for (const eng of enginesRef.current.values()) {
      eng.setMode(m);
    }
    setModeState(m);
  }, []);

  const setBrushSize = useCallback((px) => {
    let normalized = null;
    for (const eng of enginesRef.current.values()) {
      eng.setBrushSize(px);
      // Engine clamps to [MIN, MAX]; capture the post-clamp value once.
      if (normalized === null) normalized = eng.brushSize;
    }
    if (normalized !== null) setBrushSizeState(normalized);
  }, []);

  const clear = useCallback(() => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (eng) eng.clear();
  }, [activeId]);

  const fillAll = useCallback(() => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (eng) eng.fillAll();
  }, [activeId]);

  const loadDataUrl = useCallback((dataUrl) => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (eng) return eng.loadFromDataUrl(dataUrl);
    return Promise.resolve();
  }, [activeId]);

  // ── Region ops ─────────────────────────────────────────────────────

  /**
   * Replace the entire regions list with the contents of a v2
   * fog_config payload. Hydrates each engine from its region's mask;
   * disposes engines for regions that are no longer present.
   *
   * If the incoming config has no regions, an implicit "Default"
   * region is created so the workshop's first-paint flow has somewhere
   * to put the alpha.
   */
  const loadFromConfig = useCallback(async (fogConfig) => {
    const next = regionsFromConfig(fogConfig);
    setRegions(next);
    if (!next.find((r) => r.id === activeId)) {
      setActiveId(next[0]?.id ?? null);
    }
    // Hydrate engines. Note: getOrCreateEngine sidesteps the regions
    // useEffect since we want the canvas populated *before* the next
    // render so consumers reading engine.canvas don't see a blank.
    for (const r of next) {
      const eng = getOrCreateEngine(r.id);
      if (eng) await eng.loadFromRegion(r);
    }
  }, [activeId, getOrCreateEngine]);

  /**
   * Build the full v2 regions list for save/broadcast. Each entry is
   * the region's metadata from React state merged with the live mask
   * from its engine (so unsaved strokes round-trip).
   */
  const serialize = useCallback(() => {
    return regions.map((r) => {
      const eng = enginesRef.current.get(r.id);
      const mask = eng ? eng.toDataUrl() : r.mask;
      return {
        ...r,
        mask: mask || null,
        mask_width: eng ? eng.width : r.mask_width,
        mask_height: eng ? eng.height : r.mask_height,
      };
    });
  }, [regions]);

  /**
   * Resize ALL engines' canvases to match the map's aspect ratio.
   * Resizing every engine (not just the active one) keeps the shared
   * texture layer's union compositor honest — its union canvas is
   * sized to the first enabled engine and `drawImage` doesn't stretch,
   * so a region with mismatched dims would leak into the wrong area.
   * `engine.resize` preserves existing painted content via scratch-and-
   * redraw.
   */
  const fitToMap = useCallback((naturalWidth, naturalHeight, maxEdge = 1024) => {
    if (!naturalWidth || !naturalHeight) return;
    const longEdge = Math.max(naturalWidth, naturalHeight);
    const ratio = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const w = Math.max(1, Math.round(naturalWidth * ratio));
    const h = Math.max(1, Math.round(naturalHeight * ratio));
    let changed = false;
    for (const eng of enginesRef.current.values()) {
      if (w === eng.width && h === eng.height) continue;
      eng.resize(w, h);
      changed = true;
    }
    if (changed) setMaskDims({ width: w, height: h });
  }, []);

  // ── Region CRUD ────────────────────────────────────────────────────

  const updateRegion = useCallback((regionId, partial) => {
    setRegions((prev) =>
      prev.map((r) => (r.id === regionId ? { ...r, ...partial } : r))
    );
  }, []);

  const setRegionEnabled = useCallback((regionId, enabled) => {
    updateRegion(regionId, { enabled: !!enabled });
  }, [updateRegion]);

  /**
   * Append a new prepped region with default render params. Becomes
   * the active region so paint strokes go into it immediately.
   * Returns the new region dict, or null if the cap is hit.
   *
   * The engine is created eagerly so that the very next render can
   * reference it (the regions-sync useEffect would otherwise lag by
   * one render).
   */
  const addRegion = useCallback((opts = {}) => {
    const id = generateRegionId();
    const newRegion = {
      id,
      name: opts.name || 'Region',
      enabled: true,
      role: 'prepped',
      mask: null,
      mask_width: null,
      mask_height: null,
      hide_feather_px: DEFAULT_REGION_DEFAULTS.hide_feather_px,
      texture_dilate_px: DEFAULT_REGION_DEFAULTS.texture_dilate_px,
      opacity: DEFAULT_REGION_DEFAULTS.opacity,
    };
    let added = false;
    setRegions((prev) => {
      if (prev.length >= FOG_REGIONS_MAX) return prev;
      added = true;
      return [...prev, newRegion];
    });
    if (!added) return null;
    enginesRef.current.set(id, createEngine());
    setActiveId(id);
    return newRegion;
  }, [createEngine]);

  /**
   * Remove a region. The 'live' region is structural — every map
   * keeps one for ad-hoc paint at runtime — so attempts to delete it
   * are rejected with a console warning. If the deleted region was
   * active, the active id falls through to the first remaining region
   * (or null when the list goes empty).
   */
  const deleteRegion = useCallback((regionId) => {
    let removed = false;
    let nextActive = null;
    setRegions((prev) => {
      const target = prev.find((r) => r.id === regionId);
      if (!target) return prev;
      if (target.role === 'live') {
        // eslint-disable-next-line no-console
        console.warn('[useFogRegions] cannot delete the live region');
        return prev;
      }
      const next = prev.filter((r) => r.id !== regionId);
      removed = true;
      nextActive = next[0]?.id ?? null;
      return next;
    });
    if (!removed) return;
    enginesRef.current.delete(regionId);
    setActiveId((prev) => (prev === regionId ? nextActive : prev));
  }, []);

  // Resolver passed to FogRegionStack so the stack stays decoupled
  // from the hook's internal engine map. Returns null for region ids
  // we don't have an engine for (shouldn't happen in normal flow but
  // makes the stack defensively safe).
  const getEngine = useCallback((regionId) => {
    return enginesRef.current.get(regionId) ?? null;
  }, []);

  return {
    // List + active state
    regions,
    activeId,
    activeRegion: regions.find((r) => r.id === activeId) ?? null,
    activeEngine,
    setActiveRegion: setActiveId,
    // Active engine reference (back-compat alias for code that used to
    // do `fog.engine`)
    engine: activeEngine,

    // Active engine's state mirror
    mode,
    brushSize,
    isDirty,
    maskDims,

    // Active engine's paint ops
    setMode,
    setBrushSize,
    clear,
    fillAll,
    loadDataUrl,
    fitToMap,

    // Region helpers
    loadFromConfig,
    serialize,
    updateRegion,
    setRegionEnabled,
    addRegion,
    deleteRegion,
    getEngine,
    maxRegions: FOG_REGIONS_MAX,
  };
}
