/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';

// Matches the CSS for .party-drawer and .right-drawer
const DRAWER_W = 'calc(380px + var(--panel-width-addition))';
// Matches the CSS for .bottom-mixer-drawer
const MIXER_H = 'max(50vh, 300px)';

/**
 * Absolutely-positioned container that shrinks its insets to match whatever
 * drawers are currently open. Anything rendered inside can use simple
 * top/bottom/left/right positioning without knowing about drawer state.
 */
const MapSafeArea = ({ isDrawerOpen, activeRightDrawer, isMixerOpen, children }) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: isDrawerOpen ? DRAWER_W : 0,
      right: activeRightDrawer ? DRAWER_W : 0,
      bottom: isMixerOpen ? MIXER_H : 0,
      pointerEvents: 'none',
      zIndex: 30,
    }}
  >
    {children}
  </div>
);

export default MapSafeArea;
