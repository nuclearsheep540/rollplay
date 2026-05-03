/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React from 'react';

/**
 * RegionParamsEditor — sliders for the active region's render params.
 *
 * Two sliders, both edits live (the hide layer / shared texture layer
 * each have hideFeatherPx / textureDilatePx in their mask-sync deps,
 * so changes re-render within a frame):
 *
 *   • Feather — single magnitude that scales BOTH hide_feather_px and
 *     texture_dilate_px proportionally from their defaults. 1.0 = the
 *     factory feather; 0.0 = no feather (sharp brush edge); 2.0 =
 *     double-soft. Internally stored as the two underlying contract
 *     fields so future advanced controls could split them.
 *
 *   • Fog Region Opacity — applies to the region always. 1.0 fully
 *     occludes (subject to the global fogOpacity); lower values let
 *     the map show through proportionally.
 *
 * Hide colour stays a global file-level constant (intentionally not
 * user-tunable; the colour was hand-tuned and uniformity is desired).
 */

// Reference defaults the magnitude slider scales from. Mirror the
// per-region defaults that the contract / useFogRegions hook seed onto
// new regions.
const FEATHER_BASE_HIDE = 20;
const FEATHER_BASE_DILATE = 30;
const FEATHER_MAGNITUDE_MAX = 2;

export default function RegionParamsEditor({ region, onChange, disabled = false }) {
  if (!region) return null;

  // Derive the magnitude from the live hide_feather_px (texture_dilate
  // tracks proportionally; either would work, hide is the canonical
  // source). Round to 2dp so the slider tick lines up.
  const magnitude = Math.round((region.hide_feather_px / FEATHER_BASE_HIDE) * 100) / 100;

  const handleFeather = (e) => {
    if (disabled) return;
    const m = Number(e.target.value);
    onChange?.('hide_feather_px', Math.round(FEATHER_BASE_HIDE * m));
    onChange?.('texture_dilate_px', Math.round(FEATHER_BASE_DILATE * m));
  };

  const handleOpacity = (e) => {
    if (disabled) return;
    onChange?.('opacity', Number(e.target.value));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] uppercase tracking-wider text-content-secondary">
          Region settings
        </div>
        <div className="text-[10px] text-content-secondary truncate max-w-[60%]" title={region.name}>
          {region.name}
        </div>
      </div>

      <label className="block text-xs text-rose-200/80">
        Feather — <span className="text-rose-100 font-mono">{magnitude.toFixed(2)}×</span>
        <input
          type="range"
          min={0}
          max={FEATHER_MAGNITUDE_MAX}
          step={0.05}
          value={magnitude}
          onChange={handleFeather}
          disabled={disabled}
          className="w-full mt-1 accent-rose-500"
          title="Edge softness multiplier. 1.0 = default; 0.0 = sharp; 2.0 = double-soft. Scales both occlusion edge feather and texture wisp overhang together."
        />
      </label>

      <label className="block text-xs text-rose-200/80">
        Fog Region Opacity — <span className="text-rose-100 font-mono">{region.opacity.toFixed(2)}</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={region.opacity}
          onChange={handleOpacity}
          disabled={disabled}
          className="w-full mt-1 accent-rose-500"
          title="Region opacity. Always applied. Lower values let the map show through."
        />
      </label>
    </div>
  );
}
