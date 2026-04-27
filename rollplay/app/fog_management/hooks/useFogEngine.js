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

  // Dispose engine on unmount
  useEffect(() => {
    return () => {
      if (engineRef.current) {
        engineRef.current.destroy();
        engineRef.current = null;
      }
    };
  }, []);

  const setMode = useCallback((m) => {
    if (engineRef.current) engineRef.current.setMode(m);
  }, []);

  const setBrushSize = useCallback((px) => {
    if (engineRef.current) engineRef.current.setBrushSize(px);
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
  };
}
