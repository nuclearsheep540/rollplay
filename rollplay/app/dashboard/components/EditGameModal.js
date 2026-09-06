/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import { useState } from 'react'

import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import GameRecordFields from './GameRecordFields'
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

  return (
    <Modal open={!!game} onClose={isSaving ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          Edit game
        </h3>

        <GameRecordFields
          name={record.name}
          summary={record.summary}
          onChange={setRecord}
          disabled={isSaving}
          placeholderName={`Game ${gameNumber}`}
        />

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
