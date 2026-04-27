/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

const isMac = typeof navigator !== 'undefined'
  && /Mac|iPod|iPhone|iPad/.test(navigator.platform || '');
const UNDO_HINT = isMac ? '⌘Z' : 'Ctrl+Z';
const REDO_HINT = isMac ? '⇧⌘Z' : 'Ctrl+Shift+Z';

/**
 * Two text buttons in the top context bar — undo + redo. Styled to
 * exactly match the Dashboard/Back navigation buttons that sit beside
 * them, so they read as part of the same bar. Tooltips name the
 * action so users can step back deliberately.
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

  // Mirror Dashboard/Back exactly: same padding, same border, same
  // text colour. Only difference: opacity dims when disabled.
  // Using the HTML `disabled` attribute is fine here because the
  // foreground is plain text — no SVG sizing weirdness like before.
  const baseCls = 'px-2.5 py-1 text-xs rounded-sm border border-border text-content-on-dark hover:bg-surface-elevated transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent';

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
          Undo
        </button>
        <button
          type="button"
          onClick={onRedo}
          disabled={!canRedo}
          title={redoTitle}
          aria-label={redoTitle}
          className={baseCls}
        >
          Redo
        </button>
      </div>
      {/* Vertical separator so undo/redo reads as its own group, distinct
          from the navigation buttons (Dashboard / Back) that follow. */}
      <div className="w-px h-5 bg-border mx-1" aria-hidden="true" />
    </>
  );
}
