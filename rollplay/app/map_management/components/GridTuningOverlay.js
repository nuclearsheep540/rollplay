/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React from 'react';
import HoldButton from '@/app/shared/components/HoldButton';

const BTN_SIZE = 96;

const BUTTON_STYLE = {
  pointerEvents: 'auto',
  background: 'rgba(0,0,0,0.75)',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontWeight: 600,
  fontSize: '40px',
  width: `${BTN_SIZE}px`,
  height: `${BTN_SIZE}px`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
};

// Compact style for trim buttons — narrower label, smaller font
const TRIM_BUTTON_STYLE = {
  ...BUTTON_STYLE,
  width: '120px',
  height: '52px',
  fontSize: '22px',
  borderRadius: '8px',
};

// Empty cell spacer for 3×3 d-pad corners and centre
const Empty = () => <div style={{ width: BTN_SIZE, height: BTN_SIZE }} />;

/**
 * On-map tuning controls. Rendered inside MapSafeArea so it has no knowledge
 * of drawer state — positioning is purely relative to the safe area bounds.
 *
 * Layout (vertically centred):
 *   [−] [+]          ← grid size
 *   _   ↑   _
 *   ←   _   →        ← 3×3 offset d-pad
 *   _   ↓   _
 */
const GridTuningOverlay = ({
  onOffsetXChange,
  onOffsetYChange,
  onGridSizeChange,
  onColTrimChange,
  onRowTrimChange,
}) => {
  const gridStyle = {
    display: 'grid',
    gridTemplateColumns: `repeat(3, ${BTN_SIZE}px)`,
    gap: '4px',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* All controls centred as a single column */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '8px',
      }}>
        {/* Column trim */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onColTrimChange(-1)} title="Remove last column" style={TRIM_BUTTON_STYLE}>−col</HoldButton>
          <HoldButton action={() => onColTrimChange(1)}  title="Restore column"     style={TRIM_BUTTON_STYLE}>+col</HoldButton>
        </div>

        {/* Row trim */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onRowTrimChange(-1)} title="Remove last row" style={TRIM_BUTTON_STYLE}>−row</HoldButton>
          <HoldButton action={() => onRowTrimChange(1)}  title="Restore row"     style={TRIM_BUTTON_STYLE}>+row</HoldButton>
        </div>

        {/* Grid size +/- */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onGridSizeChange(1)}  title="Increase cell size" style={BUTTON_STYLE}>−</HoldButton>
          <HoldButton action={() => onGridSizeChange(-1)} title="Decrease cell size" style={BUTTON_STYLE}>+</HoldButton>
        </div>

        {/* 3×3 offset d-pad */}
        <div style={gridStyle}>
          <Empty /><HoldButton action={() => onOffsetYChange(-1)} title="Shift grid up"    style={BUTTON_STYLE}>↑</HoldButton><Empty />
          <HoldButton action={() => onOffsetXChange(-1)} title="Shift grid left"  style={BUTTON_STYLE}>←</HoldButton><Empty /><HoldButton action={() => onOffsetXChange(1)} title="Shift grid right" style={BUTTON_STYLE}>→</HoldButton>
          <Empty /><HoldButton action={() => onOffsetYChange(1)}  title="Shift grid down"  style={BUTTON_STYLE}>↓</HoldButton><Empty />
        </div>
      </div>
    </div>
  );
};

export default React.memo(GridTuningOverlay);
