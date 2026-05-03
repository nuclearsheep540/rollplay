/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React, { useEffect, useRef, useState } from 'react';

/**
 * FogRegionLabels — DM-side text overlay that pins each region's name
 * at the centroid of its painted alpha.
 *
 * Visibility is the caller's responsibility: pass `visible={false}`
 * (or skip mounting) to hide for players. The component is otherwise
 * pointer-transparent and never affects the rendered fog.
 *
 * Centroid is computed by sampling the engine's alpha pixels (every
 * SAMPLE_STEP-th, threshold-gated) — fast enough to recompute on
 * 'strokeend' and 'load' for each region. Empty masks render no label
 * (no fog, nothing to label).
 */

// Pixel sample stride for centroid computation. Step=4 means we look
// at 1/16 of pixels, plenty for a stable centre. Bump for cheaper
// updates on huge maps; drop toward 1 for pixel-perfect accuracy.
const SAMPLE_STEP = 4;

// Alpha threshold (out of 255) below which a pixel is treated as
// "not really fog". Filters faint feathered rim pixels from biasing
// the centroid toward the boundary.
const ALPHA_THRESHOLD = 32;

function computeCentroid(canvas) {
  if (!canvas || !canvas.width || !canvas.height) return null;
  const ctx = canvas.getContext('2d');
  let imageData;
  try {
    imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  } catch {
    return null;
  }
  const { data, width, height } = imageData;
  let sumX = 0;
  let sumY = 0;
  let count = 0;
  for (let y = 0; y < height; y += SAMPLE_STEP) {
    for (let x = 0; x < width; x += SAMPLE_STEP) {
      const i = (y * width + x) * 4;
      if (data[i + 3] > ALPHA_THRESHOLD) {
        sumX += x;
        sumY += y;
        count += 1;
      }
    }
  }
  if (count === 0) return null;
  return {
    x: sumX / count / width,
    y: sumY / count / height,
  };
}

export default function FogRegionLabels({
  regions = [],
  getEngine,
  mapImageRef,
  visible = true,
}) {
  const wrapperRef = useRef(null);
  const [imgDims, setImgDims] = useState({ w: 0, h: 0 });
  // { [regionId]: { x: 0..1, y: 0..1 } | null }
  const [centroids, setCentroids] = useState({});

  // Match the wrapper to the rendered map size — same pattern as
  // FogCanvasLayer so the overlay tracks pan/zoom transform.
  useEffect(() => {
    const img = mapImageRef?.current;
    if (!img) return;
    const update = () => setImgDims({ w: img.clientWidth, h: img.clientHeight });
    update();
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(update);
      ro.observe(img);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, [mapImageRef]);

  // Recompute centroids on engine 'strokeend' and 'load' for every
  // region. Re-runs when the regions list changes (add/remove).
  useEffect(() => {
    if (!getEngine) return;
    const cleanups = [];
    const initial = {};
    for (const region of regions) {
      const engine = getEngine(region.id);
      if (!engine || !engine.canvas) continue;
      initial[region.id] = computeCentroid(engine.canvas);
      const recompute = () => {
        const c = computeCentroid(engine.canvas);
        setCentroids((prev) => ({ ...prev, [region.id]: c }));
      };
      engine.on('strokeend', recompute);
      engine.on('load', recompute);
      cleanups.push(() => {
        engine.off('strokeend', recompute);
        engine.off('load', recompute);
      });
    }
    setCentroids(initial);
    return () => cleanups.forEach((fn) => fn());
  }, [regions, getEngine]);

  if (!visible) return null;

  return (
    <div
      ref={wrapperRef}
      aria-hidden="true"
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: imgDims.w || 0,
        height: imgDims.h || 0,
        pointerEvents: 'none',
        // Sit above the fog stack so labels are always readable on
        // top of any region's hide+texture composite.
        zIndex: 30,
      }}
    >
      {regions.map((region) => {
        if (!region.enabled) return null;
        const c = centroids[region.id];
        if (!c) return null;
        return (
          <div
            key={region.id}
            style={{
              position: 'absolute',
              left: `${c.x * 100}%`,
              top: `${c.y * 100}%`,
              transform: 'translate(-50%, -50%)',
              padding: '2px 8px',
              fontSize: '12px',
              fontWeight: 600,
              color: 'rgba(255, 255, 255, 0.95)',
              background: 'rgba(20, 20, 30, 0.7)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              borderRadius: '4px',
              textShadow: '0 1px 2px rgba(0, 0, 0, 0.8)',
              whiteSpace: 'nowrap',
              userSelect: 'none',
            }}
          >
            {region.name}
          </div>
        );
      })}
    </div>
  );
}
