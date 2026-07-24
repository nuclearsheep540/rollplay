/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faEye, faEyeSlash, faLock, faLockOpen } from '@fortawesome/free-solid-svg-icons';

/**
 * Shared hidden/lock toggle buttons for DM token rows (decisions 17/18) —
 * one implementation for the runtime creator panel and the workshop
 * baseline editor, so glyphs, titles, and styling can't drift apart.
 */

const ACTIVE_CLASSES = 'text-xs px-1 text-amber-300';
const IDLE_CLASSES = 'text-xs px-1 text-gray-500 hover:text-gray-300';

export function HiddenToggleButton({ hidden, onToggle }) {
  return (
    <button
      onClick={onToggle}
      className={hidden ? ACTIVE_CLASSES : IDLE_CLASSES}
      title={hidden
        ? 'Hidden from players — click to reveal'
        : 'Visible to players — click to hide'}
    >
      <FontAwesomeIcon icon={hidden ? faEyeSlash : faEye} />
    </button>
  );
}

export function LockToggleButton({
  locked,
  onToggle,
  lockedTitle = 'Locked in place — click to unlock',
  unlockedTitle = 'Unlocked — click to lock in place',
  disabled = false,
  disabledTitle = '',
}) {
  if (disabled) {
    return (
      <button disabled className="text-xs px-1 text-gray-700 cursor-not-allowed" title={disabledTitle}>
        <FontAwesomeIcon icon={faLockOpen} />
      </button>
    );
  }
  return (
    <button
      onClick={onToggle}
      className={locked ? ACTIVE_CLASSES : IDLE_CLASSES}
      title={locked ? lockedTitle : unlockedTitle}
    >
      <FontAwesomeIcon icon={locked ? faLock : faLockOpen} />
    </button>
  );
}
