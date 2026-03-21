/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen, faCrosshairs } from '@fortawesome/free-solid-svg-icons';

/**
 * Lock Map button. Rendered inside MapSafeArea so positioning is simply
 * top/right relative to the safe area — no drawer awareness needed here.
 * Styled to match .right-drawer-tab — attaches flush to the safe area's right edge.
 */
const MapOverlayPanel = ({
  isMapLocked = false,
  onToggleLock,
  activeMap = null,
  gridInspect = false,
  gridInspectMode = 'hold',
  onToggleInspectMode = null,
}) => {
  const disabled = !activeMap;
  const isMobile = typeof window !== 'undefined' &&
    (/iPhone|iPod|Android/i.test(navigator.userAgent) ||
     (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)));

  const scale = isMobile ? 1 : 1.5;

  const buttonBase = {
    height: `${36 * scale}px`,
    padding: `0 ${12 * scale}px`,
    border: '1px solid rgba(255, 255, 255, 0.1)',
    borderTop: 'none',
    outline: 'none',
    backdropFilter: 'blur(8px)',
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: `${7 * scale}px`,
    transition: 'background 200ms, color 200ms',
    fontFamily: 'system-ui',
    fontSize: `${11 * scale}px`,
    fontWeight: '600',
    whiteSpace: 'nowrap',
  };

  return (
    <div style={{ position: 'absolute', top: '0px', right: '16px', pointerEvents: 'auto', display: 'flex', gap: `${6 * scale}px` }}>
      {/* Grid Inspect button — desktop only */}
      {!isMobile && activeMap && (
        <button
          onClick={onToggleInspectMode}
          title={`Grid Inspect: ${gridInspectMode === 'hold' ? 'Hold Shift' : 'Toggle Shift'} (click to switch)`}
          style={{
            ...buttonBase,
            background: gridInspect
              ? 'rgba(59, 130, 246, 0.85)'
              : 'rgba(0, 0, 0, 0.7)',
            color: gridInspect
              ? '#bfdbfe'
              : 'rgba(255, 255, 255, 0.5)',
            borderRadius: `0 0 ${6 * scale}px ${6 * scale}px`,
            cursor: 'pointer',
          }}
        >
          <FontAwesomeIcon icon={faCrosshairs} style={{ fontSize: `${12 * scale}px` }} />
          {gridInspectMode === 'hold' ? 'HOLD' : 'TOGGLE'}
        </button>
      )}

      {/* Lock Map button */}
      <button
        onClick={onToggleLock}
        disabled={disabled}
        title={isMapLocked ? 'Unlock Map' : 'Lock Map'}
        style={{
          ...buttonBase,
          background: disabled
            ? 'rgba(0, 0, 0, 0.7)'
            : isMapLocked
              ? 'rgba(180, 83, 9, 0.85)'
              : 'rgba(0, 0, 0, 0.7)',
          color: disabled
            ? 'rgba(255, 255, 255, 0.2)'
            : isMapLocked
              ? '#fde68a'
              : 'rgba(255, 255, 255, 0.5)',
          borderRadius: `0 0 ${6 * scale}px ${6 * scale}px`,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        <FontAwesomeIcon icon={isMapLocked ? faLock : faLockOpen} style={{ fontSize: `${12 * scale}px` }} />
        {isMapLocked ? 'LOCKED' : 'LOCK MAP'}
      </button>
    </div>
  );
};

export default React.memo(MapOverlayPanel);
