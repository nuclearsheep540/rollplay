/*
 * Copyright (C) 2025 Matthew Davey
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

'use client'

import Modal from '@/app/shared/components/Modal'
import Spinner from '@/app/shared/components/Spinner'
import { Button } from './shared/Button'

export default function PauseSessionModal({ game, onConfirm, onCancel, isPausing }) {
  return (
    <Modal open={!!game} onClose={isPausing ? () => {} : onCancel} size="sm">
      <div className="p-6">
        <h3 className="text-lg font-semibold font-[family-name:var(--font-metamorphous)] mb-4 text-content-on-dark">
          Pause Session
        </h3>
        <p className="mb-2 text-content-on-dark">
          Pause <strong>&ldquo;{game?.name || 'this session'}&rdquo;</strong>?
        </p>
        <p className="text-sm mb-6 text-content-on-dark">
          All progress will be saved and you can resume this session anytime.
        </p>

        <div className="flex justify-center gap-3">
          <Button variant="ghost" onClick={onCancel} disabled={isPausing}>
            Cancel
          </Button>
          <button
            onClick={onConfirm}
            disabled={isPausing}
            className="px-4 py-2 rounded-sm border transition-all text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-interactive-hover text-content-primary border-border-active"
          >
            {isPausing ? (
              <span className="flex items-center gap-2">
                <Spinner size="sm" />
                Pausing...
              </span>
            ) : (
              'Pause Session'
            )}
          </button>
        </div>
      </div>
    </Modal>
  )
}
