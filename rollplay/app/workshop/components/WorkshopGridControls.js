/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import HoldButton from '@/app/shared/components/HoldButton';

const dpadBtnStyle = {
  width: 36,
  height: 36,
  background: '#1F1F1F',
  color: '#F7F4F3',
  border: '1px solid #37322F',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 14,
  userSelect: 'none',
  touchAction: 'manipulation',
};

const trimBtnStyle = {
  ...dpadBtnStyle,
  width: 'auto',
  height: 28,
  padding: '0 10px',
  fontSize: 11,
  fontWeight: 500,
  flex: 1,
};

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

      {/* Offset + D-pad */}
      <div>
        <div className="text-xs text-content-secondary mb-2">
          Grid Offset: X {grid.offset.x}px / Y {grid.offset.y}px
        </div>

        {/* Inline d-pad */}
        <div className="flex flex-col items-center gap-1">
          {/* Row: Column -/+ */}
          <div className="flex gap-1">
            <HoldButton action={() => grid.adjustGridCols(-1)} title="Remove column" style={trimBtnStyle}>Col −</HoldButton>
            <HoldButton action={() => grid.adjustGridCols(1)} title="Add column" style={trimBtnStyle}>Col +</HoldButton>
          </div>
          {/* Row: Row -/+ */}
          <div className="flex gap-1">
            <HoldButton action={() => grid.adjustGridRows(-1)} title="Remove row" style={trimBtnStyle}>Row −</HoldButton>
            <HoldButton action={() => grid.adjustGridRows(1)} title="Add row" style={trimBtnStyle}>Row +</HoldButton>
          </div>
          {/* Row: Cell size -/+ */}
          <div className="flex gap-1">
            <HoldButton action={() => grid.adjustCellSize(-0.5)} title="Smaller cells" style={trimBtnStyle}>Cell −</HoldButton>
            <HoldButton action={() => grid.adjustCellSize(0.5)} title="Larger cells" style={trimBtnStyle}>Cell +</HoldButton>
          </div>
          {/* 3×3 offset d-pad */}
          <div className="grid grid-cols-3 gap-1 mt-1" style={{ gridTemplateColumns: 'repeat(3, 36px)' }}>
            <div />
            <HoldButton action={() => grid.adjustOffset(0, -1)} holdAction={() => grid.adjustOffset(0, -2)} title="Shift up" style={dpadBtnStyle}><FontAwesomeIcon icon={faArrowUp} /></HoldButton>
            <div />
            <HoldButton action={() => grid.adjustOffset(-1, 0)} holdAction={() => grid.adjustOffset(-2, 0)} title="Shift left" style={dpadBtnStyle}><FontAwesomeIcon icon={faArrowLeft} /></HoldButton>
            <div />
            <HoldButton action={() => grid.adjustOffset(1, 0)} holdAction={() => grid.adjustOffset(2, 0)} title="Shift right" style={dpadBtnStyle}><FontAwesomeIcon icon={faArrowRight} /></HoldButton>
            <div />
            <HoldButton action={() => grid.adjustOffset(0, 1)} holdAction={() => grid.adjustOffset(0, 2)} title="Shift down" style={dpadBtnStyle}><FontAwesomeIcon icon={faArrowDown} /></HoldButton>
            <div />
          </div>
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
