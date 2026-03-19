/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import React, { useRef } from 'react';

const HOLD_DELAY_MS    = 100;
const HOLD_INTERVAL_MS = 50;

/**
 * Button that fires once on press, then repeatedly after a 100ms hold delay.
 * Works on mouse and touch via pointer events.
 *
 * Props:
 *   action   — function to call on each fire
 *   title    — tooltip text
 *   style    — inline style object
 *   children — button content
 */
const HoldButton = ({ action, title, style, children }) => {
  const timeoutRef  = useRef(null);
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
      style={style}
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

export default HoldButton;
