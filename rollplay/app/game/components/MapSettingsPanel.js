/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import React, { useEffect, useRef, useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faGear } from '@fortawesome/free-solid-svg-icons';

import Dropdown from '@/app/shared/components/Dropdown';
import Switch from '@/app/shared/components/Switch';

// Identity-stable default so a caller that passes nothing does not defeat
// this component's memo with a fresh object literal every render.
const NO_FORCED_SETTINGS = Object.freeze({});

const GRID_MARKER_MODES = [
  { id: 'hold', label: 'Hold' },
  { id: 'toggle', label: 'Toggle' },
];

/**
 * One row of the settings menu that flips a boolean.
 *
 * The whole row is the click target and carries the switch semantics, which
 * is the same seam MapControlsPanel uses — Switch renders the pill only and
 * leaves the row to its caller.
 */
function ToggleRow({ label, checked, onChange, isChild = false, disabled = false, title }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-disabled={disabled}
      disabled={disabled}
      title={title}
      onClick={() => onChange(!checked)}
      className={`map-settings-row ${isChild ? 'map-settings-row--child' : ''}`}
    >
      <span>{label}</span>
      <Switch checked={checked} />
    </button>
  );
}

/**
 * MapSettingsPanel — the map's per-user view settings, in one hanging tab.
 *
 * Replaces the three separate hanging buttons this used to be (grid inspect
 * mode, token labels, map lock). Rendered inside MapSafeArea, so the tab and
 * its menu track the right drawer exactly as those buttons did.
 *
 * Everything in here is client-side. No setting is broadcast, none reaches a
 * game document, and two people at the same table may hold different values
 * for all of them — these change what you see, never what is on the board.
 * Persistence is the caller's business (see useMapSettings).
 *
 * The tab is a parallelogram in the app's 8° family; the gear turns half a
 * revolution on hover. Both live in globals.css, since a :hover rule cannot
 * be expressed inline.
 */
const MapSettingsPanel = ({
  activeMap = null,
  settings,
  updateSetting,
  forcedSettings = NO_FORCED_SETTINGS,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef(null);

  const disabled = !activeMap;
  const isMobile = typeof window !== 'undefined' &&
    (/iPhone|iPod|Android/i.test(navigator.userAgent) ||
     (navigator.maxTouchPoints > 1 && /Macintosh/i.test(navigator.userAgent)));

  // Matches the size the three buttons rendered at before this replaced them.
  const scale = isMobile ? 1 : 1.5;

  // Dismiss on an outside press or Escape. Both listeners are only attached
  // while the menu is open, so a closed menu costs nothing per keystroke —
  // and the game binds Shift on window, which this must not shadow.
  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // The DM can clear the map while the menu is open, which disables the tab
  // underneath it and would otherwise leave the menu floating with no way back.
  useEffect(() => {
    if (disabled) setIsOpen(false);
  }, [disabled]);

  const currentMarkerMode = GRID_MARKER_MODES.find(
    (mode) => mode.id === settings.gridMarkerMode
  ) || GRID_MARKER_MODES[0];

  return (
    <div
      ref={containerRef}
      className="map-settings"
      style={{ '--map-settings-scale': scale, position: 'absolute', top: 0, right: '16px' }}
    >
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        disabled={disabled}
        className={`map-settings-tab ${isOpen ? 'is-open' : ''}`}
        title={disabled ? 'Load a map to change its view settings' : 'Map settings'}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <span className="map-settings-tab-inner">
          <FontAwesomeIcon icon={faGear} className="map-settings-gear" />
          MAP SETTINGS
        </span>
      </button>

      {isOpen && (
        <div className="map-settings-menu" role="group" aria-label="Map settings">
          {/* Grid inspect is Shift-driven, so it is desktop-only — as it was
              when this was a button that hid itself on touch devices. */}
          {!isMobile && (
            <>
              <div className="map-settings-row">
                <span>Map grid marker</span>
                <Dropdown
                  align="right"
                  trigger={
                    <button type="button" className="map-settings-select">
                      {currentMarkerMode.label}
                      <FontAwesomeIcon icon={faChevronDown} />
                    </button>
                  }
                  items={GRID_MARKER_MODES.map((mode) => ({
                    label: mode.label,
                    onClick: () => updateSetting('gridMarkerMode', mode.id),
                  }))}
                />
              </div>
              <p className="map-settings-hint">
                {currentMarkerMode.id === 'hold'
                  ? 'Hold Shift to inspect grid cells.'
                  : 'Press Shift to turn grid inspect on and off.'}
              </p>
              <div className="map-settings-divider" />
            </>
          )}

          <div className="map-settings-group">Labels</div>
          <ToggleRow
            label="Party names"
            checked={settings.showPartyNames}
            onChange={(value) => updateSetting('showPartyNames', value)}
            isChild
          />
          <ToggleRow
            label="Enemy names"
            checked={settings.showEnemyNames}
            onChange={(value) => updateSetting('showEnemyNames', value)}
            isChild
          />
          {/* Padlock and hidden-eye glyphs on enemy tokens. Held open for the
              DM (see useMapSettings): it is the only readout of which tokens
              they pinned or hid, and players are never sent a hidden one. */}
          <ToggleRow
            label="Enemy lock item"
            checked={settings.showEnemyLockItems}
            onChange={(value) => updateSetting('showEnemyLockItems', value)}
            isChild
            disabled={Boolean(forcedSettings.showEnemyLockItems)}
            title={forcedSettings.showEnemyLockItems
              ? 'Always on while you are running the game — it marks the tokens you locked or hid.'
              : undefined}
          />

          <div className="map-settings-divider" />

          <ToggleRow
            label="Lock map"
            checked={settings.mapLocked}
            onChange={(value) => updateSetting('mapLocked', value)}
          />
        </div>
      )}
    </div>
  );
};

export default React.memo(MapSettingsPanel);
