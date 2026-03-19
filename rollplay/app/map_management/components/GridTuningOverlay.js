/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useRef } from 'react';

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

const HOLD_DELAY_MS = 100;
const HOLD_INTERVAL_MS = 50;

/**
 * Button that fires once on press, then repeatedly after a 100ms hold delay.
 * Uses onPointerDown/Up/Leave so it also works on touch devices.
 */
const HoldButton = ({ action, title, children }) => {
  const timeoutRef = useRef(null);
  const intervalRef = useRef(null);

  const start = (e) => {
    e.stopPropagation();
    action();
    timeoutRef.current = setTimeout(() => {
      intervalRef.current = setInterval(action, HOLD_INTERVAL_MS);
    }, HOLD_DELAY_MS);
  };

  const stop = () => {
    clearTimeout(timeoutRef.current);
    clearInterval(intervalRef.current);
  };

  return (
    <button
      style={BUTTON_STYLE}
      title={title}
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
    >
      {children}
    </button>
  );
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
        {/* Grid size +/- */}
        <div style={{ display: 'flex', gap: '4px' }}>
          <HoldButton action={() => onGridSizeChange(1)}  title="Increase cell size">−</HoldButton>
          <HoldButton action={() => onGridSizeChange(-1)} title="Decrease cell size">+</HoldButton>
        </div>

        {/* 3×3 d-pad */}
        <div style={gridStyle}>
          <Empty /><HoldButton action={() => onOffsetYChange(-1)} title="Shift grid up">↑</HoldButton><Empty />
          <HoldButton action={() => onOffsetXChange(-1)} title="Shift grid left">←</HoldButton><Empty /><HoldButton action={() => onOffsetXChange(1)} title="Shift grid right">→</HoldButton>
          <Empty /><HoldButton action={() => onOffsetYChange(1)} title="Shift grid down">↓</HoldButton><Empty />
        </div>
      </div>
    </div>
  );
};

export default React.memo(GridTuningOverlay);
