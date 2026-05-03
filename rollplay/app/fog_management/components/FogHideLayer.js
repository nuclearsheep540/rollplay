/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useEffect, useRef } from 'react';

import { renderMaskUrl } from '../utils/renderMaskCanvas';

const FOG_HIDE_COLOR = 'rgba(20, 20, 30, 0.05)';

/**
 * FogHideLayer — per-region solid-colour div masked by the region's
 * painted alpha. Job: occlude the map underneath the painted shape.
 *
 * Lightweight — no SVG filter, no tile grid, no DOM children. Its
 * mask source is the engine canvas blurred by hide_feather_px and
 * contrast-boosted (the shared renderMaskCanvas util). region.opacity
 * is applied to the div itself; fogOpacity / painter knock-back live
 * on the parent wrapper so they apply uniformly to all regions.
 */
export default function FogHideLayer({
  engine,
  hideFeatherPx,
  opacity = 1.0,
}) {
  const divRef = useRef(null);
  const maskCanvasRef = useRef(null);
  const rafPendingRef = useRef(false);

  useEffect(() => {
    if (!engine) return;

    const updateMask = () => {
      const url = renderMaskUrl(engine.canvas, maskCanvasRef, hideFeatherPx, 2);
      const div = divRef.current;
      if (div && url) {
        div.style.maskImage = url;
        div.style.webkitMaskImage = url;
      }
    };

    const onChange = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        updateMask();
      });
    };

    engine.on('change', onChange);
    engine.on('load', onChange);
    updateMask();

    return () => {
      engine.off('change', onChange);
      engine.off('load', onChange);
    };
  }, [engine, hideFeatherPx]);

  return (
    <div
      ref={divRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        backgroundColor: FOG_HIDE_COLOR,
        opacity,
        maskRepeat: 'no-repeat',
        maskSize: '100% 100%',
        maskMode: 'alpha',
        WebkitMaskRepeat: 'no-repeat',
        WebkitMaskSize: '100% 100%',
      }}
    />
  );
}
