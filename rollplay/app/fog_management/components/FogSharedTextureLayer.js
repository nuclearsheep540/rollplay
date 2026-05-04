/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useLayoutEffect, useMemo, useRef } from 'react';

import { renderMaskCanvas } from '../utils/renderMaskCanvas';

const FOG_TEXTURE_URL = '/ui/fog_loop_2.gif';

// Tile grid: matches the GIF's natural pixel size so each tile renders
// unscaled; tiles overlap by FOG_OVERLAP_FRACTION and screen-blend with
// each other for a denser, less-repetitive look. Single shared grid
// means only ONE filter pipeline runs regardless of region count.
const FOG_TILE_SIZE_PX = 960;
const FOG_OVERLAP_FRACTION = 0.7;
const FOG_STRIDE_PX = Math.max(1, Math.round(FOG_TILE_SIZE_PX * (1 - FOG_OVERLAP_FRACTION)));

const FOG_BLEND_MODE = 'screen';

const FOG_DISPLACE_FREQUENCY = 0.005;
const FOG_DISPLACE_OCTAVES = 1;
const FOG_DISPLACE_SCALE = 32;
const FOG_FEATHER_PX = 6;

/**
 * FogSharedTextureLayer — singleton tile grid + SVG filter + screen
 * blend, masked by a UNION mask built from all enabled regions.
 *
 * Per-region opacity / texture_dilate_px are preserved through the
 * union mask: each region's alpha is blurred by its own dilate, then
 * weighted by its own opacity (via globalAlpha during drawImage), then
 * composited onto a shared offscreen canvas with `globalCompositeOperation:
 * 'lighten'` — max alpha per pixel across regions. Where regions don't
 * overlap, each contributes its own edge; where they overlap, the
 * brighter (higher-alpha after opacity weighting) one dominates.
 *
 * Two distinct blend concepts here, intentionally NOT conflated:
 *  - mix-blend-mode: 'screen' — visible blend between this layer and
 *    the map underneath. Same as the legacy single-region renderer.
 *  - globalCompositeOperation: 'lighten' — internal offscreen alpha-
 *    merge step for building the union mask. Never visible directly.
 *
 * Subscribes to every enabled engine's 'change'/'load' events; rebuilds
 * the union mask on any fire (rAF-throttled).
 */
export default function FogSharedTextureLayer({
  regions = [],
  getEngine,
  imgDims,
}) {
  const textureRef = useRef(null);
  const unionCanvasRef = useRef(null);
  // Per-region scratch canvases for the blur+contrast step. Map keyed
  // by region id so we reuse canvases across renders rather than
  // allocating fresh ones per frame.
  const regionMaskRefsRef = useRef(new Map());
  const rafPendingRef = useRef(false);

  // Snapshot the per-region inputs the union mask depends on. Memoise
  // so the subscription effect's deps don't churn on unrelated regions
  // state changes.
  const enabledRegions = useMemo(() => {
    return regions
      .filter((r) => r.enabled)
      .map((r) => ({
        id: r.id,
        opacity: r.opacity ?? 1.0,
        textureDilatePx: r.texture_dilate_px,
      }));
  }, [regions]);

  // Subscribe to every enabled engine's change/load. On any fire, rAF-
  // throttle a union-mask rebuild. Resubscribes when the enabled set
  // or per-region params change.
  //
  // useLayoutEffect (not useEffect) so the priming `rebuildUnion()` at
  // the end runs synchronously after DOM mutations and BEFORE the
  // browser's first paint. The component mounts only when its parent
  // has confirmed everything is ready (imgDims set, at least one
  // enabled region has an engine), so the textureRef and the first
  // engine's canvas are both guaranteed valid here.
  useLayoutEffect(() => {
    const subscriptions = [];

    const rebuildUnion = () => {
      const tex = textureRef.current;
      if (!tex) return;
      const firstEngine = getEngine(enabledRegions[0]?.id);
      const refCanvas = firstEngine?.canvas;
      if (!refCanvas) return;

      // Initialise / resize union canvas.
      let union = unionCanvasRef.current;
      if (!union) {
        union = document.createElement('canvas');
        unionCanvasRef.current = union;
      }
      if (union.width !== refCanvas.width) union.width = refCanvas.width;
      if (union.height !== refCanvas.height) union.height = refCanvas.height;
      const uctx = union.getContext('2d');
      uctx.clearRect(0, 0, union.width, union.height);
      uctx.globalCompositeOperation = 'lighten';

      // Drop scratch canvases for regions that are no longer enabled.
      const liveIds = new Set(enabledRegions.map((r) => r.id));
      for (const id of regionMaskRefsRef.current.keys()) {
        if (!liveIds.has(id)) regionMaskRefsRef.current.delete(id);
      }

      for (const r of enabledRegions) {
        const eng = getEngine(r.id);
        if (!eng) continue;
        let scratchRef = regionMaskRefsRef.current.get(r.id);
        if (!scratchRef) {
          scratchRef = { current: null };
          regionMaskRefsRef.current.set(r.id, scratchRef);
        }
        const scratch = renderMaskCanvas(eng.canvas, scratchRef, r.textureDilatePx, 2);
        if (!scratch) continue;
        uctx.globalAlpha = r.opacity;
        uctx.drawImage(scratch, 0, 0);
      }
      uctx.globalAlpha = 1;
      uctx.globalCompositeOperation = 'source-over';

      const url = `url(${union.toDataURL('image/png')})`;
      tex.style.maskImage = url;
      tex.style.webkitMaskImage = url;
    };

    const onChange = () => {
      if (rafPendingRef.current) return;
      rafPendingRef.current = true;
      requestAnimationFrame(() => {
        rafPendingRef.current = false;
        rebuildUnion();
      });
    };

    for (const r of enabledRegions) {
      const eng = getEngine(r.id);
      if (!eng) continue;
      eng.on('change', onChange);
      eng.on('load', onChange);
      subscriptions.push(eng);
    }

    // Prime once on (re)subscribe.
    rebuildUnion();

    return () => {
      for (const eng of subscriptions) {
        eng.off('change', onChange);
        eng.off('load', onChange);
      }
    };
  }, [enabledRegions, getEngine]);

  // Tile grid covering the visible map area. The grid extends BEYOND
  // (0, 0) into negative coordinates by `overlapTiles` positions so the
  // top-left corner gets the same overlap density as the interior;
  // without it points near (0, 0) are reached by only one tile while
  // interior points are reached by many, giving a "fog shifted away"
  // look at the corners. Same logic at bottom-right via `+ overlapTiles`.
  const fogTiles = useMemo(() => {
    if (!imgDims?.w || !imgDims?.h) return [];
    const overlapTiles = Math.max(0, Math.ceil(FOG_TILE_SIZE_PX / FOG_STRIDE_PX) - 1);
    const cols = Math.ceil(imgDims.w / FOG_STRIDE_PX);
    const rows = Math.ceil(imgDims.h / FOG_STRIDE_PX);
    const out = [];
    for (let r = -overlapTiles; r <= rows; r++) {
      for (let c = -overlapTiles; c <= cols; c++) {
        out.push({ x: c * FOG_STRIDE_PX, y: r * FOG_STRIDE_PX });
      }
    }
    return out;
  }, [imgDims?.w, imgDims?.h]);

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
      }}
    >
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <filter id="fog-displace" x="-20%" y="-20%" width="140%" height="140%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency={FOG_DISPLACE_FREQUENCY}
              numOctaves={FOG_DISPLACE_OCTAVES}
              seed="3"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale={FOG_DISPLACE_SCALE}
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />
            <feGaussianBlur in="displaced" stdDeviation={FOG_FEATHER_PX} />
          </filter>
        </defs>
      </svg>

      {/* Filter wraps the masked tile grid; mix-blend-mode lifts wisps
          against the hide layer underneath (and against the map in the
          dilated overhang where hide is transparent). */}
      <div
        aria-hidden="true"
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          filter: 'url(#fog-displace)',
          mixBlendMode: FOG_BLEND_MODE,
        }}
      >
        <div
          ref={textureRef}
          style={{
            position: 'absolute',
            inset: 0,
            overflow: 'hidden',
            pointerEvents: 'none',
            maskRepeat: 'no-repeat',
            maskSize: '100% 100%',
            maskMode: 'alpha',
            WebkitMaskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
          }}
        >
          {fogTiles.map((t, i) => (
            <div
              key={i}
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: `${t.x}px`,
                top: `${t.y}px`,
                width: `${FOG_TILE_SIZE_PX}px`,
                height: `${FOG_TILE_SIZE_PX}px`,
                backgroundImage: `url(${FOG_TEXTURE_URL})`,
                backgroundSize: `${FOG_TILE_SIZE_PX}px ${FOG_TILE_SIZE_PX}px`,
                backgroundRepeat: 'no-repeat',
                mixBlendMode: FOG_BLEND_MODE,
              }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
