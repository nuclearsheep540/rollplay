/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';

/**
 * Lock Map button. Rendered inside MapSafeArea so positioning is simply
 * top/right relative to the safe area — no drawer awareness needed here.
 * Styled to match .right-drawer-tab — attaches flush to the safe area's right edge.
 */
const MapOverlayPanel = ({
  isMapLocked = false,
  onToggleLock,
  activeMap = null,
}) => {
  const disabled = !activeMap;

  return (
    <div style={{ position: 'absolute', top: '0px', right: '16px', pointerEvents: 'auto' }}>
      <button
        onClick={onToggleLock}
        disabled={disabled}
        title={isMapLocked ? 'Unlock Map' : 'Lock Map'}
        style={{
          height: '36px',
          padding: '0 12px',
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
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderTop: 'none',
          borderRadius: '0 0 6px 6px',
          backdropFilter: 'blur(8px)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: '7px',
          opacity: disabled ? 0.4 : 1,
          transition: 'background 200ms, color 200ms',
          fontFamily: 'system-ui',
          fontSize: '11px',
          fontWeight: '600',
          whiteSpace: 'nowrap',
        }}
      >
        <FontAwesomeIcon icon={isMapLocked ? faLock : faLockOpen} style={{ fontSize: '12px' }} />
        {isMapLocked ? 'LOCKED' : 'LOCK MAP'}
      </button>
    </div>
  );
};

export default React.memo(MapOverlayPanel);
