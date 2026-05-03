/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React from 'react';

import FogCanvasLayer from './FogCanvasLayer';

/**
 * FogRegionStack — renders one FogCanvasLayer per enabled fog region.
 *
 * Each region carries its own painted alpha mask + render params
 * (hide_feather_px, texture_dilate_px, opacity). This component just
 * iterates and mounts one FogCanvasLayer instance per region, passing
 * the per-region engine + params.
 *
 * Compositing is handled by the DOM: each FogCanvasLayer renders a
 * hide layer + texture layer; stacked layers from overlapping enabled
 * regions naturally compose into denser fog (two hide layers stack =
 * darker; texture layers screen-blend with each other).
 *
 * paintMode is true on the *active* region only — DM strokes only
 * land in the region they're currently painting into. Disabled regions
 * are skipped entirely (no engine work, no DOM cost).
 *
 * Props:
 *   regions         — the FogRegion list (metadata + per-region params)
 *   getEngine(id)   — resolves a region id to its FogEngine instance.
 *                     Typically `(id) => useFogRegions().enginesRef.current.get(id)`,
 *                     but the hook surfaces this via its `activeEngine`
 *                     accessor and a per-region map; callers pass a
 *                     resolver so the stack stays decoupled from any
 *                     particular state container.
 *   activeRegionId  — region currently receiving paint events; null
 *                     means "no painting happening anywhere".
 *   paintMode       — global paint-mode flag; the active region renders
 *                     with paintMode=true only when this is also true.
 *   mapImageRef     — the map <img> ref, used for sizing.
 *   fogOpacity      — applied uniformly across all regions.
 */
export default function FogRegionStack({
  regions = [],
  getEngine,
  activeRegionId = null,
  paintMode = false,
  mapImageRef,
  fogOpacity = 1.0,
}) {
  if (!regions.length || !getEngine) return null;

  return (
    <>
      {regions.map((region) => {
        if (!region.enabled) return null;
        const engine = getEngine(region.id);
        if (!engine) return null;
        const isActive = region.id === activeRegionId;
        return (
          <FogCanvasLayer
            key={region.id}
            engine={engine}
            mapImageRef={mapImageRef}
            paintMode={paintMode && isActive}
            fogOpacity={fogOpacity}
            hideFeatherPx={region.hide_feather_px}
            textureDilatePx={region.texture_dilate_px}
            opacity={region.opacity}
          />
        );
      })}
    </>
  );
}
