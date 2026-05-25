/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faRotateLeft, faRotateRight } from '@fortawesome/free-solid-svg-icons';

const isMac = typeof navigator !== 'undefined'
  && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
const UNDO_HINT = isMac ? '⌘Z' : 'Ctrl+Z';
const REDO_HINT = isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z';

/**
 * Undo / Redo buttons for the top context bar.
 *
 * Mirrors the Dashboard / Back button structure exactly (flex layout,
 * gap-2, FA icon + label span, same padding and border classes) so the
 * icon renders the same way it does for those — that pattern is proven
 * to work in this app, so we don't reinvent the wheel here.
 */
export default function MapConfigUndoRedo({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  peekUndoLabel,
  peekRedoLabel,
}) {
  const undoTitle = canUndo
    ? `Undo: ${peekUndoLabel}  (${UNDO_HINT})`
    : `Nothing to undo  (${UNDO_HINT})`;
  const redoTitle = canRedo
    ? `Redo: ${peekRedoLabel}  (${REDO_HINT})`
    : `Nothing to redo  (${REDO_HINT})`;

  const baseCls = 'flex items-center gap-2 px-2.5 py-1 rounded-sm border border-border text-content-on-dark hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

  return (
    <>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onUndo}
          disabled={!canUndo}
          title={undoTitle}
          aria-label={undoTitle}
          className={baseCls}
        >
          <FontAwesomeIcon icon={faRotateLeft} className="text-[10px]" />
          <span className="text-xs">Undo</span>
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={redoTitle}
          aria-label={redoTitle}
          className={baseCls}
        >
          <FontAwesomeIcon icon={faRotateRight} className="text-[10px]" />
          <span className="text-xs">Redo</span>
        </button>
      </div>
      {/* Vertical separator so undo/redo reads as its own group, distinct
          from the navigation buttons (Dashboard / Back) that follow. */}
      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />
    </>
  );
}
