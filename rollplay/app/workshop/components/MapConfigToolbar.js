/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faHandBackFist,
  faTableCells,
  faCloud,
  faPaintbrush,
  faEraser,
} from '@fortawesome/free-solid-svg-icons';

/**
 * Photoshop-style vertical tool strip for the Map Config workshop.
 *
 * Tools (top → bottom):
 *  - move    (hand-back-fist)  — pan/zoom the map only, no editing
 *  - grid    (table-cells)     — opens grid configuration in the right panel
 *  - paint   (paintbrush)      — fog of war: paint
 *  - erase   (eraser)          — fog of war: reveal
 *
 * Paint and Erase share a fog group: when either is active, both icons
 * are visible and grouped under a cloud header so it's clear they're
 * variants of the same tool. When the active tool is move or grid, the
 * fog group still renders (collapsed) — the user can click straight in
 * without an extra "open fog" step.
 */

const TOOL_BUTTON_CLASSES = (active) => `
  group relative flex items-center justify-center w-12 h-12 rounded-sm
  border border-transparent transition-all duration-100
  ${active
    ? 'bg-amber-500 text-slate-900 border-amber-300 shadow-md ring-2 ring-amber-400/60'
    : 'bg-transparent text-content-secondary hover:bg-surface-elevated hover:text-content-on-dark'}
`;

function ToolButton({ icon, label, active, onClick, shortcut, indent = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${TOOL_BUTTON_CLASSES(active)} ${indent ? 'ml-3' : ''}`}
      title={shortcut ? `${label}  (${shortcut})` : label}
      aria-label={label}
      aria-pressed={active}
    >
      <FontAwesomeIcon icon={icon} className="text-base" />
    </button>
  );
}

export default function MapConfigToolbar({ activeTool, onToolChange }) {
  const isFogTool = activeTool === 'paint' || activeTool === 'erase';

  // Clicking the cloud parent tool jumps to paint by default — the most
  // common fog action. If the user is already on a fog sub-tool, treat
  // a re-click as a no-op (keep their current sub-tool selection).
  const handleFogParentClick = () => {
    if (!isFogTool) onToolChange('paint');
  };

  return (
    <div className="flex flex-col items-stretch gap-1 p-2 border-r border-border bg-surface-secondary flex-shrink-0">
      <ToolButton
        icon={faHandBackFist}
        label="Move (pan & zoom)"
        active={activeTool === 'move'}
        onClick={() => onToolChange('move')}
        shortcut="V"
      />
      <ToolButton
        icon={faTableCells}
        label="Grid configuration"
        active={activeTool === 'grid'}
        onClick={() => onToolChange('grid')}
        shortcut="G"
      />

      {/* Fog group — cloud is the parent tool button, same visual weight
          as move/grid. Sub-tools (paint/erase) only render when fog is
          active; they're indented + accented with a left rail to read as
          children rather than peers. */}
      <ToolButton
        icon={faCloud}
        label="Fog of war"
        active={isFogTool}
        onClick={handleFogParentClick}
        shortcut="F"
      />
      {isFogTool && (
        <div className="flex flex-col gap-1 border-l-2 border-amber-400/60 pl-1 ml-2">
          <ToolButton
            icon={faPaintbrush}
            label="Paint fog"
            active={activeTool === 'paint'}
            onClick={() => onToolChange('paint')}
            shortcut="B"
          />
          <ToolButton
            icon={faEraser}
            label="Reveal (erase fog)"
            active={activeTool === 'erase'}
            onClick={() => onToolChange('erase')}
            shortcut="E"
          />
        </div>
      )}
    </div>
  );
}
