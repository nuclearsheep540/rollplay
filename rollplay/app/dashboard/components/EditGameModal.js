/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { THEME } from '@/app/styles/colorTheme'
import { Button } from './shared/Button'

/**
 * Correct a past game's record.
 *
 * The GM names the night as it ends, when they are tired and the party is
 * leaving. This is where they fix it a week later, so the history is worth
 * reading — which is the whole point of keeping one.
 */
export default function EditGameModal({ game, gameNumber, onSave, onCancel, isSaving }) {
  const [record, setRecord] = useState({
    name: game?.name || '',
    summary: game?.summary || '',
  })

  // The compact twin of the wrap-up's fields. Deliberately not shared with it:
  // that one is a page the GM writes on as the evening ends, this is a quick
  // correction weeks later, and a single component serving both would need
  // props for every label, row count and placeholder that differ.
  const fieldStyle = {
    backgroundColor: THEME.bgPrimary,
    borderColor: THEME.borderSubtle,
    color: THEME.textPrimary,
  }

  return (
    <Modal open={!!game} onClose={isSaving ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          Edit game
        </h3>

        <div className="space-y-3 mb-6 text-left">
          <div>
            <label
              htmlFor="edit-game-name"
              className="block text-xs font-medium mb-1 tracking-wide"
              style={{ color: THEME.textSecondary }}
            >
              Name
            </label>
            <input
              id="edit-game-name"
              type="text"
              maxLength={100}
              value={record.name}
              disabled={isSaving}
              placeholder={`Game ${gameNumber}`}
              onChange={(event) => setRecord({ ...record, name: event.target.value })}
              className="w-full px-3 py-2 rounded-sm border text-sm focus:outline-none focus:ring-2 disabled:opacity-50"
              style={fieldStyle}
            />
          </div>

          <div>
            <label
              htmlFor="edit-game-summary"
              className="block text-xs font-medium mb-1 tracking-wide"
              style={{ color: THEME.textSecondary }}
            >
              What happened
            </label>
            <textarea
              id="edit-game-summary"
              rows={4}
              value={record.summary}
              disabled={isSaving}
              placeholder="A few lines so everyone remembers where you left off"
              onChange={(event) => setRecord({ ...record, summary: event.target.value })}
              className="w-full px-3 py-2 rounded-sm border text-sm resize-none focus:outline-none focus:ring-2 disabled:opacity-50"
              style={fieldStyle}
            />
          </div>
        </div>

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <button
            onClick={() => onSave(record)}
            disabled={isSaving}
            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-interactive-hover text-content-primary border-border-active"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Saving...
              </span>
            ) : (
              'Save'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
