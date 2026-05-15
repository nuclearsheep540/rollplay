/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

import { useEffect } from 'react';

/**
 * Dev-only render tracker — keeps a rolling timestamp log per component
 * so a debug overlay can compute "renders per second" / "renders per
 * 10s" without forcing re-renders to feed the data.
 *
 * Mutates a window-scoped store directly. The PerfOverlay reads it via
 * a self-driven rAF loop so the act of measuring doesn't itself count
 * as a render.
 *
 * Production builds tree-shake the bump call (it's gated on
 * NODE_ENV !== 'production' inside the hook).
 */

const STORE_KEY = '__rollplayRenderTracker';
const WINDOW_MS = 10_000; // keep last 10 seconds of timestamps

function getStore() {
  if (typeof window === 'undefined') return null;
  if (!window[STORE_KEY]) {
    window[STORE_KEY] = { counts: new Map() };
  }
  return window[STORE_KEY];
}

function bump(name) {
  const store = getStore();
  if (!store) return;
  const now = performance.now();
  let arr = store.counts.get(name);
  if (!arr) {
    arr = [];
    store.counts.set(name, arr);
  }
  arr.push(now);
  // Note: trim happens on READ, not on push. If we trimmed only here,
  // a component that renders once and then sits quiet would keep its
  // stale entry forever — the count10s value would lie indefinitely.
}

/**
 * Increment the render counter for `name` once per component commit.
 * Place anywhere in a component body; the count fires after the
 * commit phase via useEffect, so it counts committed renders, not
 * concurrent-render attempts.
 */
export function useRenderTracker(name) {
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    bump(name);
  });
}

/**
 * Read current render stats. Returns:
 *   { [name]: { count1s, count10s, perSec10s } }
 * — count1s: renders in the last 1 second.
 * — count10s: renders in the last 10 seconds (full window).
 * — perSec10s: count10s / 10 — average per-second over the window.
 *
 * Cheap to call frequently (single iteration, no allocations beyond
 * the result object).
 */
export function readRenderStats() {
  const store = getStore();
  if (!store) return {};
  const now = performance.now();
  const cutoff10s = now - WINDOW_MS;
  const cutoff1s = now - 1000;
  const result = {};
  for (const [name, arr] of store.counts) {
    // Trim stale entries here so the window reflects "renders in the
    // last 10s" even when the component hasn't rendered recently. If
    // we relied on bump() for trimming, a one-shot render's timestamp
    // would survive forever.
    while (arr.length && arr[0] < cutoff10s) arr.shift();
    let count1s = 0;
    for (let i = arr.length - 1; i >= 0; i--) {
      if (arr[i] >= cutoff1s) count1s++;
      else break;
    }
    const count10s = arr.length;
    result[name] = {
      count1s,
      count10s,
      perSec10s: count10s / 10,
    };
  }
  return result;
}

/**
 * Reset all counters. Keeps the existing component keys (with empty
 * arrays) so components that have rendered at least once remain
 * visible in the overlay with `0/0` counts — otherwise they'd
 * disappear until their next render and the table would look empty.
 */
export function resetRenderStats() {
  const store = getStore();
  if (!store) return;
  for (const arr of store.counts.values()) {
    arr.length = 0;
  }
}
