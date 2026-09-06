/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { Button } from './shared/Button'

/**
 * Confirm ending the running game.
 *
 * Nothing is lost, and the copy says so plainly — the old Finish Session dialog
 * warned that the session could not be resumed and sat behind a 3-second
 * countdown, because finishing really was permanent. Ending is not: the same
 * game starts again with its board and log intact, so the friction goes too.
 */
export default function EndGameModal({ campaign, onConfirm, onCancel, isEnding }) {
  return (
    <Modal open={!!campaign} onClose={isEnding ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          End Game
        </h3>
        <p className="mb-2 text-content-on-dark">
          End the game for <strong>&ldquo;{campaign?.title || 'this campaign'}&rdquo;</strong>?
        </p>
        <p className="text-sm mb-6 text-content-on-dark">
          Everyone at the table returns to their dashboard. Token positions and the
          adventure log are kept, and start again exactly where you left them.
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isEnding}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
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
