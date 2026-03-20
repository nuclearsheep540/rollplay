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
  width: '146px',
  height: '52px',
  fontSize: '18px',
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
  onCellSizeChange,
  onColChange,
  onRowChange,
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
        {/* Column count */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onColChange(-1)} title="Remove last column" style={TRIM_BUTTON_STYLE}>Column<br />Remove</HoldButton>
          <HoldButton action={() => onColChange(1)}  title="Add column"         style={TRIM_BUTTON_STYLE}>Column<br />Add</HoldButton>
        </div>

        {/* Row count */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onRowChange(-1)} title="Remove last row" style={TRIM_BUTTON_STYLE}>Row<br />Remove</HoldButton>
          <HoldButton action={() => onRowChange(1)}  title="Add row"         style={TRIM_BUTTON_STYLE}>Row<br />Add</HoldButton>
        </div>

        {/* Cell size +/- (1px native per tick) */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onCellSizeChange(-1)} title="Smaller cells" style={TRIM_BUTTON_STYLE}>Cell Size<br />Decrease</HoldButton>
          <HoldButton action={() => onCellSizeChange(1)}  title="Larger cells"  style={TRIM_BUTTON_STYLE}>Cell Size<br />Increase</HoldButton>
        </div>

        {/* 3×3 offset d-pad */}
        <div style={gridStyle}>
          <Empty /><HoldButton action={() => onOffsetYChange(-1)} holdAction={() => onOffsetYChange(-2)} title="Shift grid up"    style={BUTTON_STYLE}>↑</HoldButton><Empty />
          <HoldButton action={() => onOffsetXChange(-1)} holdAction={() => onOffsetXChange(-2)} title="Shift grid left"  style={BUTTON_STYLE}>←</HoldButton><Empty /><HoldButton action={() => onOffsetXChange(1)} holdAction={() => onOffsetXChange(2)} title="Shift grid right" style={BUTTON_STYLE}>→</HoldButton>
          <Empty /><HoldButton action={() => onOffsetYChange(1)}  holdAction={() => onOffsetYChange(2)}  title="Shift grid down"  style={BUTTON_STYLE}>↓</HoldButton><Empty />
        </div>
      </div>
    </div>
  );
};

export default React.memo(GridTuningOverlay);
