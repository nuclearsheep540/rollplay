/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import { useEffect, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faHourglassHalf } from '@fortawesome/free-solid-svg-icons';
import { COLORS } from '@/app/styles/colorTheme';

/**
 * Countdown to the session's signed-URL lease expiry (urls_expire_at from the
 * game-state response). Display only — api-site's expiry sweeper enforces the
 * deadline by auto-pausing the session, which surfaces the standard
 * "Session Ended" modal to connected players.
 *
 * hh:mm while ≥1h remains, mm:ss under 1h. Freezes at 00:00 (never negative)
 * until the server-side pause lands.
 */
export default function SessionCountdown({ expireAt }) {
  const [remainingMs, setRemainingMs] = useState(() =>
    expireAt ? Math.max(0, expireAt - Date.now()) : null
  );

  useEffect(() => {
    if (!expireAt) {
      setRemainingMs(null);
      return;
    }
    // Recompute from the anchor each tick (drift-proof) rather than decrementing
    const interval = setInterval(() => {
      const remaining = Math.max(0, expireAt - Date.now());
      setRemainingMs(remaining);
      if (remaining === 0) clearInterval(interval);
    }, 1000);
    setRemainingMs(Math.max(0, expireAt - Date.now()));
    return () => clearInterval(interval);
  }, [expireAt]);

  if (remainingMs === null) return null;

  const totalSeconds = Math.floor(remainingMs / 1000);
  let display;
  if (totalSeconds >= 3600) {
    // hh:mm — hours not capped at 24, so a 24h lease reads 24:00
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    display = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  } else {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    display = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return (
    <div
      title="Session auto-pauses when the timer ends"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'calc(6px * var(--ui-scale))',
        color: COLORS.smoke,
        whiteSpace: 'nowrap',
        userSelect: 'none',
      }}
    >
      <FontAwesomeIcon
        icon={faHourglassHalf}
        style={{ fontSize: 'calc(12px * var(--ui-scale))' }}
      />
      <span
        style={{
          fontFamily: 'var(--font-share-tech-mono), monospace',
          fontVariantNumeric: 'tabular-nums',
          fontSize: 'calc(14px * var(--ui-scale))',
          letterSpacing: '0.08em',
        }}
      >
        {display}
      </span>
    </div>
  );
}
