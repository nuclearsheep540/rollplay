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
 *
 * `showModeToggle` controls whether the paint/reveal toggle buttons
 * render here. In contexts where a tool palette already owns mode
 * selection (the workshop's left toolbar), set this to false so the
 * panel stays focused on brush + bulk ops + save/discard.
 *
 * `showEnableToggle` controls the "enable painting" gate — same idea:
 * when the host already owns paint-mode activation (a tool palette
 * implies it), drop the gate.
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
  showModeToggle = true,
  showEnableToggle = true,
}) {
  return (
    <div className="space-y-2">
      {/* Paint mode toggle — gates pointer events on the canvas.
          Active state uses solid amber fill + ring; inactive uses an
          outlined neutral so it's unambiguous which state we're in. */}
      {showEnableToggle && onPaintModeToggle && (
        <button
          type="button"
          onClick={() => onPaintModeToggle(!paintMode)}
          disabled={disabled}
          className={`w-full text-sm rounded px-3 py-2 border-2 transition-all duration-100 ${
            paintMode
              ? 'bg-amber-500 border-amber-300 text-slate-900 font-semibold shadow-md ring-2 ring-amber-400/60'
              : 'bg-transparent border-slate-500 text-slate-300 hover:border-slate-400 hover:text-slate-100'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          {paintMode ? '✏️  Painting active — click to disable' : '🎨  Click to enable painting'}
        </button>
      )}

      {/* Paint vs Reveal — exclusive selection. Active gets a saturated
          fill in its mode colour (rose for paint, sky for reveal) plus
          a ring; inactive is just an outline so the choice is obvious. */}
      {showModeToggle && (
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => onModeChange && onModeChange('paint')}
          disabled={disabled || !paintMode}
          aria-pressed={mode === 'paint'}
          className={`flex-1 text-sm rounded px-3 py-2 border-2 transition-all duration-100 ${
            mode === 'paint'
              ? 'bg-rose-600 border-rose-300 text-white font-semibold shadow-md ring-2 ring-rose-400/60'
              : 'bg-transparent border-slate-500 text-slate-300 hover:border-rose-400 hover:text-rose-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          ☁️  Paint fog
        </button>
        <button
          type="button"
          onClick={() => onModeChange && onModeChange('erase')}
          disabled={disabled || !paintMode}
          aria-pressed={mode === 'erase'}
          className={`flex-1 text-sm rounded px-3 py-2 border-2 transition-all duration-100 ${
            mode === 'erase'
              ? 'bg-sky-600 border-sky-300 text-white font-semibold shadow-md ring-2 ring-sky-400/60'
              : 'bg-transparent border-slate-500 text-slate-300 hover:border-sky-400 hover:text-sky-200'
          } disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          🩹  Reveal
        </button>
      </div>
      )}

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
        {onUpdate && (
          <button
            type="button"
            onClick={onUpdate}
            disabled={disabled || !isDirty}
            className="flex-1 text-sm rounded px-3 py-2 border bg-emerald-700 border-emerald-500 text-emerald-100 hover:brightness-125 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDirty ? 'Update fog →' : 'No changes'}
          </button>
        )}
      </div>
    </div>
  );
}
