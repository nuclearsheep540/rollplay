/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';

/**
 * Lock Map button. Rendered inside MapSafeArea so positioning is simply
 * top/right relative to the safe area — no drawer awareness needed here.
 */
const MapOverlayPanel = ({
  isMapLocked = false,
  onToggleLock,
  activeMap = null,
}) => {
  const disabled = !activeMap;

  return (
    <div style={{ position: 'absolute', top: '16px', right: '16px', pointerEvents: 'auto' }}>
      <button
        onClick={onToggleLock}
        disabled={disabled}
        style={{
          background: disabled
            ? 'rgba(100, 100, 100, 0.6)'
            : isMapLocked
              ? 'rgba(139, 69, 19, 0.9)'
              : 'rgba(34, 139, 34, 0.9)',
          color: '#ffffff',
          border: '2px solid rgba(255, 255, 255, 0.3)',
          borderRadius: '8px',
          padding: '10px 16px',
          fontSize: '14px',
          fontWeight: '600',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontFamily: 'system-ui',
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <span style={{ fontSize: '16px' }}>{isMapLocked ? '🔒' : '🔓'}</span>
        <span>{isMapLocked ? 'Unlock Map' : 'Lock Map'}</span>
      </button>
    </div>
  );
};

export default React.memo(MapOverlayPanel);
