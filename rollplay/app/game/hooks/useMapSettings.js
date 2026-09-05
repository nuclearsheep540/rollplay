/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react';

// One key holding every map setting rather than a key per setting.
// localStorage only stores strings, so a blob costs one parse on mount and
// one write per change, and a setting added later needs no migration: the
// stored object is spread over the defaults below, so an older blob simply
// arrives missing a key and takes the default for it.
const STORAGE_KEY = 'rollplay.mapSettings';

export const MAP_SETTINGS_DEFAULTS = {
  // How Shift drives grid inspect: hold the key down, or press it to flip.
  gridMarkerMode: 'hold', // 'hold' | 'toggle'
  showPartyNames: true,
  showEnemyNames: true,
  // The DM-only corner glyphs on an enemy token: a padlock when locked, a
  // ghosted eye when hidden from players. Both flags are npc-only in the
  // token contract, which is why this setting is "enemy" and has no party
  // counterpart — a party token can never carry either.
  showEnemyLockItems: true,
  mapLocked: false,
};

// Settings a role holds open, and the identity-stable empty case for everyone
// else — a fresh object literal per render would defeat the panel's memo.
const NO_FORCED_SETTINGS = Object.freeze({});
const DM_FORCED_SETTINGS = Object.freeze({ showEnemyLockItems: true });

function readStoredSettings() {
  if (typeof window === 'undefined') return MAP_SETTINGS_DEFAULTS;
  try {
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY));
    if (!stored || typeof stored !== 'object' || Array.isArray(stored)) {
      return MAP_SETTINGS_DEFAULTS;
    }
    // Spread OVER the defaults, never replace them. A blob written before a
    // setting existed still yields a complete object, so no consumer can be
    // handed undefined for a setting it renders from.
    return { ...MAP_SETTINGS_DEFAULTS, ...stored };
  } catch (error) {
    // Corrupt or hand-edited entry. Defaults are always a usable answer, so
    // this is a warning and not a failure.
    console.warn('MAPSETTINGS: stored settings unreadable, using defaults', error);
    return MAP_SETTINGS_DEFAULTS;
  }
}

/**
 * Per-user map view settings: grid marker mode, token label visibility, and
 * the map lock.
 *
 * Client-side only, deliberately. Every setting here changes what THIS person
 * sees and nothing about the shared board, so none of it is sent over the
 * WebSocket or written to a game document — two players at the same table can
 * disagree about all of them. Anything that must look the same for everyone
 * belongs on the map itself, not in here.
 *
 * Some settings are not the viewer's to choose. The DM must always see the
 * lock and hidden markers on enemy tokens: they are the only person who can
 * act on that state — a locked token refuses to move, a hidden one is
 * invisible to players — so a DM who had quietly switched the markers off
 * would be misreading their own board. Forced rather than merely defaulted,
 * so a value stored while playing cannot follow someone into the DM's chair.
 *
 * Returns the effective settings, an updater taking one key at a time, and
 * the map of settings the viewer's role holds open (which the UI disables).
 * Storage always holds the viewer's own choice, never the forced value, so
 * it comes back when they are no longer running the game.
 */
export function useMapSettings({ isDM = false } = {}) {
  // Read lazily so storage is touched once, on mount, rather than per render.
  const [settings, setSettings] = useState(readStoredSettings);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (error) {
      // A full or blocked store must not break the session. The settings
      // still apply here; they just will not survive a reload.
      console.warn('MAPSETTINGS: settings could not be saved', error);
    }
  }, [settings]);

  const updateSetting = useCallback((key, value) => {
    setSettings((previous) => ({ ...previous, [key]: value }));
  }, []);

  const forcedSettings = isDM ? DM_FORCED_SETTINGS : NO_FORCED_SETTINGS;
  const effectiveSettings = useMemo(
    () => ({ ...settings, ...forcedSettings }),
    [settings, forcedSettings]
  );

  return { settings: effectiveSettings, updateSetting, forcedSettings };
}
