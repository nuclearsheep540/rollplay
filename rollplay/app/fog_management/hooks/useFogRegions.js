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
 *     hide_feather_px, texture_dilate_px, paint_mode_opacity }
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
  paint_mode_opacity: 0.7,
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

  // Mirror of the active engine's state for React consumers. Same shape
  // as useFogEngine returned, so callers can swap hooks with minimal
  // change.
  const [mode, setModeState] = useState('paint');
  const [brushSize, setBrushSizeState] = useState(40);
  const [isDirty, setIsDirty] = useState(false);
  const [maskDims, setMaskDims] = useState({ width, height });

  const getOrCreateEngine = useCallback((regionId) => {
    if (typeof window === 'undefined') return null;
    let eng = enginesRef.current.get(regionId);
    if (!eng) {
      eng = new FogEngine({ width, height });
      enginesRef.current.set(regionId, eng);
    }
    return eng;
  }, [width, height]);

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
        map.set(r.id, new FogEngine({ width, height }));
      }
    }
  }, [regions, width, height]);

  // Subscribe to the active engine so its state surfaces into React.
  // Re-binds when the active id changes — different engine, fresh
  // listeners.
  useEffect(() => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (!eng) return;

    // Snapshot current values into React state
    setModeState(eng.mode);
    setBrushSizeState(eng.brushSize);
    setIsDirty(eng.isDirty);
    setMaskDims({ width: eng.width, height: eng.height });

    const onChange = () => setIsDirty(eng.isDirty);
    const onLoad = ({ width: w, height: h, cleared } = {}) => {
      setIsDirty(false);
      if (!cleared && w && h) setMaskDims({ width: w, height: h });
    };
    const onBrush = ({ brushSize: bs }) => setBrushSizeState(bs);
    const onModeCh = ({ mode: m }) => setModeState(m);

    eng.on('change', onChange);
    eng.on('load', onLoad);
    eng.on('brushchange', onBrush);
    eng.on('modechange', onModeCh);

    return () => {
      eng.off('change', onChange);
      eng.off('load', onLoad);
      eng.off('brushchange', onBrush);
      eng.off('modechange', onModeCh);
    };
  }, [activeId]);

  // ── Paint ops, all targeting the active engine ──────────────────────

  const activeEngine = activeId ? enginesRef.current.get(activeId) ?? null : null;

  const setMode = useCallback((m) => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (!eng) return;
    eng.setMode(m);
    setModeState(eng.mode);
  }, [activeId]);

  const setBrushSize = useCallback((px) => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (!eng) return;
    eng.setBrushSize(px);
    setBrushSizeState(eng.brushSize);
  }, [activeId]);

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
   * Resize the active engine's canvas to match the map's aspect ratio.
   * Same logic as useFogEngine — applies only to the region currently
   * being painted; other engines keep their existing dimensions.
   */
  const fitToMap = useCallback((naturalWidth, naturalHeight, maxEdge = 1024) => {
    const eng = activeId ? enginesRef.current.get(activeId) : null;
    if (!eng || !naturalWidth || !naturalHeight) return;
    const longEdge = Math.max(naturalWidth, naturalHeight);
    const ratio = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const w = Math.max(1, Math.round(naturalWidth * ratio));
    const h = Math.max(1, Math.round(naturalHeight * ratio));
    if (w === eng.width && h === eng.height) return;
    eng.resize(w, h);
    setMaskDims({ width: w, height: h });
  }, [activeId]);

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
      paint_mode_opacity: DEFAULT_REGION_DEFAULTS.paint_mode_opacity,
    };
    let added = false;
    setRegions((prev) => {
      if (prev.length >= FOG_REGIONS_MAX) return prev;
      added = true;
      return [...prev, newRegion];
    });
    if (!added) return null;
    enginesRef.current.set(id, new FogEngine({ width, height }));
    setActiveId(id);
    return newRegion;
  }, [width, height]);

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
