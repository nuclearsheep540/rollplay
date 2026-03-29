/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef } from 'react';

export default function WorkshopGridControls({ grid, onSave, isSaving, saveSuccess, error }) {
  const gridColorInputRef = useRef(null);

  // Initialize Coloris colour picker
  useEffect(() => {
    let cleanup = null;

    const initColoris = async () => {
      try {
        const { default: Coloris } = await import('@melloware/coloris');
        Coloris.init();
        Coloris({
          el: '.workshop-grid-color-input',
          wrap: false,
          theme: 'polaroid',
          themeMode: 'dark',
          alpha: false,
          format: 'hex',
          clearButton: false,
          closeButton: true,
          closeLabel: 'Close',
        });

        const handleColorPick = (event) => {
          grid.setGridColor(event.detail.color);
        };

        document.addEventListener('coloris:pick', handleColorPick);
        cleanup = () => document.removeEventListener('coloris:pick', handleColorPick);
      } catch (err) {
        console.error('Failed to initialize Coloris:', err);
      }
    };

    initColoris();
    return () => { if (cleanup) cleanup(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-content-on-dark">Grid Configuration</h3>

      {/* Cell Size */}
      <div>
        <label className="block text-xs text-content-secondary mb-1">
          Cell Size: {grid.cellSize}px · Grid: {grid.gridCols}×{grid.gridRows} cells
        </label>
        <input
          type="range"
          min="8"
          max="100"
          step="0.5"
          value={grid.cellSize}
          onChange={(e) => grid.setCellSize(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-xs text-content-secondary mt-1">
          <span>Small (8px)</span>
          <span>Medium</span>
          <span>Large (100px)</span>
        </div>
      </div>

      {/* Opacity */}
      <div>
        <label className="block text-xs text-content-secondary mb-1">
          Grid Opacity: {(grid.gridOpacity * 100).toFixed(0)}%
        </label>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={grid.gridOpacity}
          onChange={(e) => grid.setGridOpacity(parseFloat(e.target.value))}
          className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
        />
        <div className="flex justify-between text-xs text-content-secondary mt-1">
          <span>10%</span>
          <span>50%</span>
          <span>100%</span>
        </div>
      </div>

      {/* Colour */}
      <div>
        <label className="block text-xs text-content-secondary mb-1">
          Grid Colour
        </label>
        <div className="flex items-center gap-2">
          <input
            ref={gridColorInputRef}
            type="text"
            className="workshop-grid-color-input w-8 h-8 rounded border-2 cursor-pointer"
            value={grid.gridColor}
            readOnly
            style={{
              color: 'transparent',
              textIndent: '-9999px',
              backgroundColor: grid.gridColor,
              borderColor: grid.gridColor,
            }}
          />
          <span className="text-xs text-content-secondary">{grid.gridColor}</span>
        </div>
      </div>

      {/* Offset readout */}
      <div>
        <div className="text-xs text-content-secondary mb-1">
          Grid Offset: X {grid.offset.x}px / Y {grid.offset.y}px
        </div>
        <div className="text-xs text-content-secondary/60">
          Use the on-map D-pad to nudge the grid position.
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-2 rounded-sm border bg-feedback-error/20 border-feedback-error">
          <p className="text-xs text-feedback-error">{error}</p>
        </div>
      )}

      {/* Save button */}
      <button
        onClick={onSave}
        disabled={isSaving}
        className={`w-full px-4 py-2.5 rounded-sm text-sm font-semibold border transition-all ${
          saveSuccess
            ? 'bg-feedback-success/20 text-feedback-success border-feedback-success'
            : 'bg-surface-secondary text-content-on-dark border-border-active hover:opacity-90'
        } disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        {isSaving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Grid Config'}
      </button>
    </div>
  );
}
