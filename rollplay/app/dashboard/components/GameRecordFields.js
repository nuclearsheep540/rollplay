/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { THEME } from '@/app/styles/colorTheme'

/**
 * The GM's record of a night: what it was called, and what happened.
 *
 * One component because it appears in three places that must stay identical —
 * the drawer's End dialog, the in-game End confirm, and editing a past game
 * afterwards. Neither field ever blocks anything: a GM who just wants the game
 * to stop leaves both empty, and the history falls back to "Game {n}".
 */
export default function GameRecordFields({ name, summary, onChange, disabled, placeholderName }) {
  return (
    <div className="space-y-3 mb-6 text-left">
      <div>
        <label
          htmlFor="game-record-name"
          className="block text-xs font-medium mb-1 tracking-wide"
          style={{ color: THEME.textSecondary }}
        >
          Name this game (optional)
        </label>
        <input
          id="game-record-name"
          type="text"
          maxLength={100}
          value={name}
          disabled={disabled}
          placeholder={placeholderName}
          onChange={(event) => onChange({ name: event.target.value, summary })}
          className="w-full px-3 py-2 rounded-sm border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            backgroundColor: THEME.bgPrimary,
            borderColor: THEME.borderSubtle,
            color: THEME.textPrimary,
          }}
        />
      </div>

      <div>
        <label
          htmlFor="game-record-summary"
          className="block text-xs font-medium mb-1 tracking-wide"
          style={{ color: THEME.textSecondary }}
        >
          What happened? (optional)
        </label>
        <textarea
          id="game-record-summary"
          rows={3}
          value={summary}
          disabled={disabled}
          placeholder="A line or two so everyone remembers where you left off"
          onChange={(event) => onChange({ name, summary: event.target.value })}
          className="w-full px-3 py-2 rounded-sm border text-sm resize-none focus:outline-none focus:ring-2 disabled:opacity-50"
          style={{
            backgroundColor: THEME.bgPrimary,
            borderColor: THEME.borderSubtle,
            color: THEME.textPrimary,
          }}
        />
      </div>
    </div>
  )
}
