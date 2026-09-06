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
 * Confirm ending the running game.
 *
 * Nothing is lost, and the copy says so plainly — the old Finish Session dialog
 * warned that the session could not be resumed and sat behind a 3-second
 * countdown, because finishing really was permanent. Ending is not: the same
 * game starts again with its board and log intact, so the friction goes too.
 *
 * It is also where the night gets its name and its summary — the moment the GM
 * knows what it was. Both optional; neither blocks ending.
 */
export default function EndGameModal({ campaign, game, gameNumber, onConfirm, onCancel, isEnding }) {
  // Prefilled from what the GM planned before Start, so a night that was named
  // in advance keeps its name unless they change their mind here.
  const [record, setRecord] = useState({
    name: game?.name || '',
    summary: game?.summary || '',
  })

  return (
    <Modal open={!!campaign} onClose={isEnding ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          End Game
        </h3>
        <p className="mb-2 text-content-on-dark">
          End the game for <strong>&ldquo;{campaign?.title || 'this campaign'}&rdquo;</strong>?
        </p>
        <p className="text-sm mb-4 text-content-on-dark">
          Everyone at the table returns to their dashboard. Token positions and the
          adventure log are kept, and the next game starts exactly where you left them.
        </p>

        <GameRecordFields
          name={record.name}
          summary={record.summary}
          onChange={setRecord}
          disabled={isEnding}
          placeholderName={`Game ${gameNumber}`}
        />

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isEnding}>
            Cancel
          </Button>
          <button
            onClick={() => onConfirm(record)}
            disabled={isEnding}
            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-interactive-hover text-content-primary border-border-active"
          >
            {isEnding ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Ending...
              </span>
            ) : (
              'End Game'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
