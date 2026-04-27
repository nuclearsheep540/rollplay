/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import React from 'react';

/**
 * FogPaintControls — DM-only UI for painting the fog mask.
 *
 * Pure presentational: receives state + callbacks, never reaches into
 * the engine directly. Layout is intentionally lightweight so it slots
 * cleanly into either the in-game DM drawer or the workshop preview.
 */
export default function FogPaintControls({
  paintMode = false,
  onPaintModeToggle = null,
  mode = 'paint',          // 'paint' | 'erase'
  onModeChange = null,
  brushSize = 40,
  onBrushSizeChange = null,
  isDirty = false,
  onClear = null,
  onFillAll = null,
  onUpdate = null,
  onResetToServer = null,  // discard local edits, reload from last known server state
  disabled = false,
}) {
  return (
    <div className="space-y-2">
      {/* Paint mode toggle — gates pointer events on the canvas */}
      {onPaintModeToggle && (
        <button
          type="button"
          onClick={() => onPaintModeToggle(!paintMode)}
          disabled={disabled}
          className={`w-full text-sm rounded px-3 py-2 border transition-all duration-100 ${
            paintMode
              ? 'bg-amber-500/30 border-amber-400/60 text-amber-100'
              : 'bg-rose-900/50 border-rose-400/50 text-rose-100 hover:brightness-125'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {paintMode ? '✏️  Painting active — click to disable' : '🎨  Enable painting'}
        </button>
      )}

      {/* Paint vs Erase */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange && onModeChange('paint')}
          disabled={disabled || !paintMode}
          className={`flex-1 text-sm rounded px-3 py-2 border transition-all duration-100 ${
            mode === 'paint'
              ? 'bg-rose-500/30 border-rose-400/60 text-rose-100'
              : 'bg-rose-900/30 border-rose-400/30 text-rose-200 hover:brightness-125'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          ☁️  Paint fog
        </button>
        <button
          type="button"
          onClick={() => onModeChange && onModeChange('erase')}
          disabled={disabled || !paintMode}
          className={`flex-1 text-sm rounded px-3 py-2 border transition-all duration-100 ${
            mode === 'erase'
              ? 'bg-sky-500/30 border-sky-400/60 text-sky-100'
              : 'bg-rose-900/30 border-rose-400/30 text-rose-200 hover:brightness-125'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          🩹  Reveal
        </button>
      </div>

      {/* Brush size slider */}
      <label className="block text-xs text-rose-200/80">
        Brush size — <span className="text-rose-100 font-mono">{brushSize}px</span>
        <input
          type="range"
          min={2}
          max={500}
          step={1}
          value={brushSize}
          onChange={(e) => onBrushSizeChange && onBrushSizeChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full mt-1 accent-rose-500"
        />
      </label>

      {/* Bulk ops */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onFillAll}
          disabled={disabled || !onFillAll}
          className="flex-1 text-xs rounded px-2 py-1.5 border bg-rose-900/30 border-rose-400/40 text-rose-200 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Fill all
        </button>
        <button
          type="button"
          onClick={onClear}
          disabled={disabled || !onClear}
          className="flex-1 text-xs rounded px-2 py-1.5 border bg-rose-900/30 border-rose-400/40 text-rose-200 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Clear all
        </button>
      </div>

      {/* Save / discard */}
      <div className="flex gap-2 pt-1">
        {onResetToServer && (
          <button
            type="button"
            onClick={onResetToServer}
            disabled={disabled || !isDirty}
            className="flex-1 text-sm rounded px-3 py-2 border bg-slate-700 border-slate-500 text-slate-200 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Discard
          </button>
        )}
        <button
          type="button"
          onClick={onUpdate}
          disabled={disabled || !onUpdate || !isDirty}
          className="flex-1 text-sm rounded px-3 py-2 border bg-emerald-700 border-emerald-500 text-emerald-100 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isDirty ? 'Update fog →' : 'No changes'}
        </button>
      </div>
    </div>
  );
}
