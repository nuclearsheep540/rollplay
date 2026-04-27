/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import FogEngine from '../engine/FogEngine';

/**
 * useFogEngine — React adapter around FogEngine.
 *
 * Single hook used in both contexts (in-game DM panel and workshop
 * map editor). Owns the engine lifecycle (create on mount, destroy on
 * unmount) and surfaces engine state to React.
 *
 * Engine state (the canvas itself) lives outside React's render cycle
 * — only metadata (mode, brushSize, isDirty) flows through useState.
 * This is what gives us the no-flicker guarantee: the canvas is never
 * re-mounted, so React re-renders can never blank the fog mid-update.
 */
export function useFogEngine({ width = 1024, height = 1024 } = {}) {
  const engineRef = useRef(null);

  // SSR guard — only construct on client
  if (typeof window !== 'undefined' && !engineRef.current) {
    engineRef.current = new FogEngine({ width, height });
  }

  const [mode, setModeState] = useState('paint');
  const [brushSize, setBrushSizeState] = useState(40);
  const [isDirty, setIsDirty] = useState(false);
  const [maskDims, setMaskDims] = useState({ width, height });

  // Subscribe to engine events to surface state into React
  useEffect(() => {
    const engine = engineRef.current;
    if (!engine) return;

    const onChange = () => setIsDirty(engine.isDirty);
    const onLoad = ({ width: w, height: h, cleared } = {}) => {
      setIsDirty(false);
      if (!cleared && w && h) setMaskDims({ width: w, height: h });
    };
    const onBrush = ({ brushSize: bs }) => setBrushSizeState(bs);
    const onModeCh = ({ mode: m }) => setModeState(m);

    engine.on('change', onChange);
    engine.on('load', onLoad);
    engine.on('brushchange', onBrush);
    engine.on('modechange', onModeCh);

    return () => {
      engine.off('change', onChange);
      engine.off('load', onLoad);
      engine.off('brushchange', onBrush);
      engine.off('modechange', onModeCh);
    };
  }, []);

  // Intentionally NO explicit dispose effect.
  //
  // Calling engine.destroy() in an unmount cleanup breaks under React
  // Strict Mode in dev: the fake-unmount cycle runs the cleanup, the
  // engine gets destroyed and the ref nulled, and then the subscription
  // effect's re-setup reads `engineRef.current === null` and returns
  // without subscribing. The next render lazy-creates a fresh engine,
  // but it lives without listeners, so `isDirty` never reflects paint
  // events and the Save button stays "No changes" forever.
  //
  // The engine has no DOM resources to free explicitly — its canvas is
  // an off-DOM HTMLCanvasElement and gets garbage-collected with the
  // ref when the hook truly unmounts. Worst case (route change without
  // unmounting the hook host) is a one-engine-per-mount leak for the
  // page lifetime, which is harmless at this scale (~3MB per canvas).

  const setMode = useCallback((m) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setMode(m);
    // Read back from the engine so React state matches the canonical
    // value even if the 'modechange' event listener hasn't fired yet
    // (or no-op'd because the value was already current).
    setModeState(eng.mode);
  }, []);

  const setBrushSize = useCallback((px) => {
    const eng = engineRef.current;
    if (!eng) return;
    eng.setBrushSize(px);
    // Engine clamps to [MIN, MAX] and rounds — read back so the slider
    // reflects the post-clamp value, not whatever the input emitted.
    setBrushSizeState(eng.brushSize);
  }, []);

  const clear = useCallback(() => {
    if (engineRef.current) engineRef.current.clear();
  }, []);

  const fillAll = useCallback(() => {
    if (engineRef.current) engineRef.current.fillAll();
  }, []);

  const loadDataUrl = useCallback((dataUrl) => {
    if (engineRef.current) return engineRef.current.loadFromDataUrl(dataUrl);
    return Promise.resolve();
  }, []);

  const serialize = useCallback(() => {
    return engineRef.current ? engineRef.current.serialize() : null;
  }, []);

  /**
   * Resize the engine canvas to match the map's aspect ratio. Long
   * edge is clamped to maxEdge px so the PNG payload stays small —
   * the mask is rendered scaled to the map's display size on the
   * client, so resolution matters only for fog-edge sharpness.
   *
   * No-ops if the engine is already at the target dimensions or if
   * the inputs are invalid. Engine.resize() preserves any existing
   * painted content via drawImage scaling.
   */
  const fitToMap = useCallback((naturalWidth, naturalHeight, maxEdge = 1024) => {
    const eng = engineRef.current;
    if (!eng || !naturalWidth || !naturalHeight) return;
    const longEdge = Math.max(naturalWidth, naturalHeight);
    const ratio = longEdge > maxEdge ? maxEdge / longEdge : 1;
    const w = Math.max(1, Math.round(naturalWidth * ratio));
    const h = Math.max(1, Math.round(naturalHeight * ratio));
    if (w === eng.width && h === eng.height) return;
    eng.resize(w, h);
    setMaskDims({ width: w, height: h });
  }, []);

  return {
    engine: engineRef.current,
    mode,
    brushSize,
    isDirty,
    maskDims,
    setMode,
    setBrushSize,
    clear,
    fillAll,
    loadDataUrl,
    serialize,
    fitToMap,
  };
}
