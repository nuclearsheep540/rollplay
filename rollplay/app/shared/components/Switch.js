/* Copyright (C) 2025 Matthew Davey */
/* SPDX-License-Identifier: GPL-3.0-or-later */

'use client'

/**
 * Switch — the pill-and-knob control for a binary state.
 *
 * Extracted from CombatControlsPanel's combat toggle when the grid on/off
 * control became its second consumer. A label-only button ("Grid On" /
 * "Grid Off") is ambiguous — it never reads clearly as *state* versus
 * *action* — so anything genuinely on/off should use this instead.
 *
 * Renders the pill only; the caller owns the row, label and click target.
 * That is the seam that actually varies: DM panel rows use DM_CHILD with the
 * whole row clickable, other surfaces may not.
 *
 * Not Headless UI's Switch: this is a presentational pill with no internal
 * state, and the repo has no other Headless Switch usage to be consistent
 * with. Give it a real <button> wrapper (or aria-checked on the row) if it
 * ever needs to be reachable on its own.
 */
export default function Switch({ checked, className = '' }) {
  return (
    <div
      className={`rounded-full border-2 transition-colors duration-200 w-14 h-7 shrink-0 ${
        checked ? 'bg-emerald-800 border-emerald-500' : 'bg-slate-700 border-slate-500'
      } ${className}`}
      aria-hidden="true"
    >
      <div
        className={`inline-block rounded-full bg-white shadow-lg transform transition-transform duration-300 w-4 h-4 m-1 ${
          checked ? 'translate-x-6' : 'translate-x-0'
        }`}
      />
    </div>
  );
}
