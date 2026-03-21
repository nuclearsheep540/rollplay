/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowUp, faArrowDown, faArrowLeft, faArrowRight } from '@fortawesome/free-solid-svg-icons';
import HoldButton from '@/app/shared/components/HoldButton';

// Responsive sizes — clamp(min, preferred, max)
// On 375px landscape (vmin≈375): d-pad ≈ 44px, trim ≈ 32×80px
// On desktop (vmin≈900): d-pad = 96px, trim = 52×146px
const BTN    = 'clamp(44px, 11vmin, 96px)';
const TRIM_W = 'clamp(80px, 32vmin, 146px)';
const TRIM_H = 'clamp(32px, 8vmin, 52px)';

const BASE = {
  pointerEvents: 'auto',
  background: 'rgba(0,0,0,0.75)',
  color: '#fff',
  border: 'none',
  borderRadius: '10px',
  cursor: 'pointer',
  fontFamily: 'monospace',
  fontWeight: 600,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  userSelect: 'none',
  WebkitUserSelect: 'none',
  touchAction: 'manipulation',
};

const BUTTON_STYLE = {
  ...BASE,
  width: BTN,
  height: BTN,
  fontSize: 'clamp(18px, 5vmin, 40px)',
};

const TRIM_BUTTON_STYLE = {
  ...BASE,
  width: TRIM_W,
  height: TRIM_H,
  fontSize: 'clamp(11px, 2.5vmin, 18px)',
  borderRadius: '8px',
};

const Empty = () => <div style={{ width: BTN, height: BTN }} />;

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
    gridTemplateColumns: `repeat(3, ${BTN})`,
    gap: '4px',
  };

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
      {/* All controls centred as a single column, capped to 70% of the viewport */}
      <div style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: 'translate(-50%, -50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '4px',
        maxWidth: '70vw',
        maxHeight: '70vh',
        overflow: 'hidden',
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
          <Empty />
          <HoldButton action={() => onOffsetYChange(-1)} holdAction={() => onOffsetYChange(-2)} title="Shift grid up"    style={BUTTON_STYLE}><FontAwesomeIcon icon={faArrowUp} /></HoldButton>
          <Empty />
          <HoldButton action={() => onOffsetXChange(-1)} holdAction={() => onOffsetXChange(-2)} title="Shift grid left"  style={BUTTON_STYLE}><FontAwesomeIcon icon={faArrowLeft} /></HoldButton>
          <Empty />
          <HoldButton action={() => onOffsetXChange(1)}  holdAction={() => onOffsetXChange(2)}  title="Shift grid right" style={BUTTON_STYLE}><FontAwesomeIcon icon={faArrowRight} /></HoldButton>
          <Empty />
          <HoldButton action={() => onOffsetYChange(1)}  holdAction={() => onOffsetYChange(2)}  title="Shift grid down"  style={BUTTON_STYLE}><FontAwesomeIcon icon={faArrowDown} /></HoldButton>
          <Empty />
        </div>
      </div>
    </div>
  );
};

export default React.memo(GridTuningOverlay);
