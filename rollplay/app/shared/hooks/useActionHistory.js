/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * useActionHistory — generic undo/redo for typed, self-describing actions.
 *
 * The hook holds two stacks of opaque action records and dispatches
 * apply() to a handler resolved by `action.kind` from the registry the
 * caller passes in. The hook itself never inspects `before`/`after` —
 * those shapes are owned by each kind.
 *
 * Action shape (caller-defined per kind):
 *   {
 *     kind:      string,    // discriminator, must match a key in `handlers`
 *     label:     string,    // human-readable for tooltips/menus
 *     timestamp: number,    // Date.now() at creation
 *     before:    any,       // payload passed to apply() on undo
 *     after:     any,       // payload passed to apply() on redo
 *   }
 *
 * Handler shape:
 *   {
 *     apply: async (payload) => void,
 *   }
 *
 * `apply` is the *same* code path for undo and redo — only the payload
 * differs (`action.before` vs `action.after`). One contract, no drift.
 *
 * Calling `undo()` or `redo()` for a kind without a registered handler
 * throws. Fail loud, not silent.
 *
 * Stacks are session-local; nothing persists across reloads.
 */
export function useActionHistory({ handlers, capacity = 10 } = {}) {
  // Refs so push/undo/redo can read the latest values without stale
  // closures, while we still expose state to React for re-renders.
  const historyRef = useRef([]);
  const redoRef = useRef([]);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  // State mirrors are only used to drive UI (button enabled/disabled,
  // tooltip text). They re-render when stacks change.
  const [historySize, setHistorySize] = useState(0);
  const [redoSize, setRedoSize] = useState(0);
  const [isApplying, setIsApplying] = useState(false);

  const sync = useCallback(() => {
    setHistorySize(historyRef.current.length);
    setRedoSize(redoRef.current.length);
  }, []);

  const push = useCallback((action) => {
    if (!action || !action.kind) {
      throw new Error('useActionHistory.push: action requires a kind');
    }
    historyRef.current.push(action);
    if (historyRef.current.length > capacity) {
      historyRef.current.shift(); // drop oldest
    }
    redoRef.current = []; // any new action invalidates redo
    sync();
    // eslint-disable-next-line no-console
    console.log(
      `[history] push ${action.kind} — history=${historyRef.current.length} redo=${redoRef.current.length}`,
      action,
    );
  }, [capacity, sync]);

  const apply = useCallback(async (action, direction) => {
    const handler = handlersRef.current?.[action.kind];
    if (!handler || typeof handler.apply !== 'function') {
      throw new Error(`useActionHistory: no handler registered for kind "${action.kind}"`);
    }
    const payload = direction === 'undo' ? action.before : action.after;
    setIsApplying(true);
    try {
      await handler.apply(payload);
    } finally {
      setIsApplying(false);
    }
  }, []);

  const undo = useCallback(async () => {
    if (historyRef.current.length === 0 || isApplying) return;
    const action = historyRef.current.pop();
    try {
      await apply(action, 'undo');
      redoRef.current.push(action);
      sync();
    } catch (err) {
      // Restore on failure so the stack and the world stay in sync.
      historyRef.current.push(action);
      sync();
      throw err;
    }
  }, [apply, isApplying, sync]);

  const redo = useCallback(async () => {
    if (redoRef.current.length === 0 || isApplying) return;
    const action = redoRef.current.pop();
    try {
      await apply(action, 'redo');
      historyRef.current.push(action);
      if (historyRef.current.length > capacity) {
        historyRef.current.shift();
      }
      sync();
    } catch (err) {
      redoRef.current.push(action);
      sync();
      throw err;
    }
  }, [apply, capacity, isApplying, sync]);

  const clear = useCallback(() => {
    historyRef.current = [];
    redoRef.current = [];
    sync();
  }, [sync]);

  const peekUndoLabel = historyRef.current.length > 0
    ? historyRef.current[historyRef.current.length - 1].label
    : null;
  const peekRedoLabel = redoRef.current.length > 0
    ? redoRef.current[redoRef.current.length - 1].label
    : null;

  return {
    push,
    undo,
    redo,
    clear,
    canUndo: historySize > 0 && !isApplying,
    canRedo: redoSize > 0 && !isApplying,
    isApplying,
    historySize,
    redoSize,
    peekUndoLabel,
    peekRedoLabel,
  };
}
